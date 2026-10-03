import { sha256, userNamespace, vectorId } from './hash';
import { ulid } from './id';
import { rankingBoost } from './ranking';
import { weightedRrf } from './rrf';
import type { AuthContext, Env, RecordRow, SearchInput, SearchResult, UpsertInput } from './types';

function nowIso(): string { return new Date().toISOString(); }
function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
function maxTopK(value?: number): number { return Math.min(50, Math.max(1, value ?? 10)); }
function ftsExpression(query: string): string | null {
  const tokens = query.split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length >= 2).slice(0, 24)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return tokens.length ? tokens.join(' OR ') : null;
}

export class ConflictError extends Error {}

export class PersonalDB {
  constructor(private env: Env, private auth: AuthContext) {}

  private get userId(): string { return this.auth.userId; }

  async ensureUser(): Promise<void> {
    const now = nowIso();
    await this.env.DB.prepare(
      `INSERT INTO users(user_id, created_at, updated_at) VALUES(?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at`
    ).bind(this.userId, now, now).run();
  }

  async getRecord(id: string): Promise<RecordRow | null> {
    return await this.env.DB.prepare(
      `SELECT * FROM records WHERE user_id=? AND id=? AND deleted_at IS NULL LIMIT 1`
    ).bind(this.userId, id).first<RecordRow>();
  }

  async upsert(input: UpsertInput): Promise<{ status: string; record: RecordRow }> {
    await this.ensureUser();
    const id = input.id ?? ulid();
    const version = Math.max(1, input.version ?? 1);
    const metadata = input.metadata ?? {};
    const canonicalHash = await sha256(JSON.stringify({ type: input.type, content: input.content, metadata }));
    if (input.content_hash && input.content_hash !== canonicalHash) throw new ConflictError('content_hash_mismatch');

    const tombstone = await this.env.DB.prepare(
      `SELECT version FROM tombstones WHERE user_id=? AND id=? LIMIT 1`
    ).bind(this.userId, id).first<{ version: number }>();
    if (tombstone) throw new ConflictError('tombstoned_id_cannot_be_resurrected');

    const current = await this.env.DB.prepare(
      `SELECT * FROM records WHERE user_id=? AND id=? LIMIT 1`
    ).bind(this.userId, id).first<RecordRow>();
    if (current) {
      if (current.version > version) return { status: 'stale_ignored', record: current };
      if (current.version === version) {
        if (current.content_hash === canonicalHash) return { status: 'idempotent_noop', record: current };
        throw new ConflictError('same_version_different_content');
      }
    }

    const now = nowIso();
    const createdAt = current?.created_at ?? input.created_at ?? now;
    const oldVectors = await this.env.DB.prepare(
      `SELECT vector_id FROM chunks WHERE user_id=? AND record_id=? AND vector_id IS NOT NULL`
    ).bind(this.userId, id).all<{ vector_id: string }>();

    const chunkInputs = input.chunks?.length ? input.chunks : [{ content: input.content, vector: input.vector }];
    const chunks = [] as Array<{ id: string; content: string; hash: string; vector?: number[]; vectorId?: string }>;
    for (let i = 0; i < chunkInputs.length; i += 1) {
      const chunk = chunkInputs[i]!;
      const chunkId = chunk.id ?? `${id}#${String(i).padStart(4, '0')}`;
      const hash = await sha256(chunk.content);
      chunks.push({ id: chunkId, content: chunk.content, hash, vector: chunk.vector, vectorId: chunk.vector ? await vectorId(this.userId, chunkId) : undefined });
    }

    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare(
        `INSERT INTO records(id,user_id,record_type,version,device_id,created_at,updated_at,deleted_at,content_hash,content,metadata_json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id,id) DO UPDATE SET
           record_type=excluded.record_type, version=excluded.version, device_id=excluded.device_id,
           updated_at=excluded.updated_at, deleted_at=NULL, content_hash=excluded.content_hash,
           content=excluded.content, metadata_json=excluded.metadata_json`
      ).bind(id, this.userId, input.type, version, input.device_id, createdAt, now, null, canonicalHash, input.content, JSON.stringify(metadata)),
      this.env.DB.prepare(`DELETE FROM chunks WHERE user_id=? AND record_id=?`).bind(this.userId, id),
    ];
    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i]!;
      statements.push(this.env.DB.prepare(
        `INSERT INTO chunks(id,user_id,record_id,chunk_index,content,content_hash,vector_id,vector_status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).bind(c.id, this.userId, id, i, c.content, c.hash, c.vectorId ?? null, c.vector ? 'pending' : 'absent', now, now));
    }
    await this.env.DB.batch(statements);

    if (this.env.VECTORIZE) {
      const oldIds = oldVectors.results.map((r) => r.vector_id).filter(Boolean);
      if (oldIds.length) await this.env.VECTORIZE.deleteByIds(oldIds).catch(() => undefined);
      const expected = Number(this.env.EMBEDDING_DIMENSIONS ?? 384);
      const vectors = chunks.filter((c) => c.vector && c.vectorId).map((c) => {
        if (c.vector!.length !== expected) throw new ConflictError(`vector_dimensions_must_equal_${expected}`);
        return {
          id: c.vectorId!, values: c.vector!, namespace: '',
          metadata: { record_id: id, chunk_id: c.id, type: input.type }
        };
      });
      if (vectors.length) {
        const namespace = await userNamespace(this.userId);
        try {
          await this.env.VECTORIZE.upsert(vectors.map((v) => ({ ...v, namespace })));
          await this.env.DB.prepare(`UPDATE chunks SET vector_status='ready' WHERE user_id=? AND record_id=? AND vector_id IS NOT NULL`).bind(this.userId, id).run();
        } catch {
          await this.env.DB.prepare(`UPDATE chunks SET vector_status='error' WHERE user_id=? AND record_id=? AND vector_id IS NOT NULL`).bind(this.userId, id).run();
        }
      }
    }

    const record = await this.getRecord(id);
    if (!record) throw new Error('upsert_failed');
    return { status: current ? 'updated' : 'created', record };
  }

  async delete(id: string, version: number, deviceId: string): Promise<{ status: string }> {
    await this.ensureUser();
    const current = await this.env.DB.prepare(`SELECT * FROM records WHERE user_id=? AND id=? LIMIT 1`).bind(this.userId, id).first<RecordRow>();
    const existing = await this.env.DB.prepare(`SELECT version FROM tombstones WHERE user_id=? AND id=? LIMIT 1`).bind(this.userId, id).first<{ version: number }>();
    if (existing && existing.version >= version) return { status: 'idempotent_noop' };
    const effectiveVersion = Math.max(version, (current?.version ?? 0) + 1);
    const deletedAt = nowIso();
    const hash = current?.content_hash ?? await sha256(`deleted:${id}`);
    const vectorRows = await this.env.DB.prepare(`SELECT vector_id FROM chunks WHERE user_id=? AND record_id=? AND vector_id IS NOT NULL`).bind(this.userId, id).all<{ vector_id: string }>();
    await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO tombstones(user_id,id,record_type,version,device_id,deleted_at,content_hash)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(user_id,id) DO UPDATE SET version=MAX(version,excluded.version), device_id=excluded.device_id,
           deleted_at=excluded.deleted_at, content_hash=excluded.content_hash`
      ).bind(this.userId, id, current?.record_type ?? 'unknown', effectiveVersion, deviceId, deletedAt, hash),
      this.env.DB.prepare(`DELETE FROM chunks WHERE user_id=? AND record_id=?`).bind(this.userId, id),
      this.env.DB.prepare(`UPDATE records SET deleted_at=?, updated_at=?, version=?, device_id=? WHERE user_id=? AND id=?`).bind(deletedAt, deletedAt, effectiveVersion, deviceId, this.userId, id),
    ]);
    if (this.env.VECTORIZE) {
      const ids = vectorRows.results.map((r) => r.vector_id).filter(Boolean);
      if (ids.length) await this.env.VECTORIZE.deleteByIds(ids).catch(() => undefined);
    }
    return { status: 'deleted' };
  }

  private async lexicalSearch(input: SearchInput, topK: number): Promise<{ ids: string[]; rowsRead: number }> {
    const match = ftsExpression(input.query);
    if (!match) return { ids: [], rowsRead: 0 };
    const contextSql = input.context ? ` AND json_extract(r.metadata_json,'$.context')=?` : '';
    const typeSql = input.type ? ` AND r.record_type=?` : '';
    const sql = `SELECT c.id AS chunk_id FROM chunks_fts
      JOIN chunks c ON c.rowid = chunks_fts.rowid
      JOIN records r ON r.user_id=c.user_id AND r.id=c.record_id
      WHERE chunks_fts MATCH ? AND c.user_id=? AND r.deleted_at IS NULL${typeSql}${contextSql}
      ORDER BY bm25(chunks_fts) LIMIT ?`;
    const binds: unknown[] = [match, this.userId];
    if (input.type) binds.push(input.type);
    if (input.context) binds.push(input.context);
    binds.push(Math.min(50, topK * 4));
    const result = await this.env.DB.prepare(sql).bind(...binds).all<{ chunk_id: string }>();
    return { ids: result.results.map((r) => r.chunk_id), rowsRead: Number(result.meta?.rows_read ?? 0) };
  }

  private async vectorSearch(input: SearchInput, topK: number): Promise<string[]> {
    if (!input.vector?.length || !this.env.VECTORIZE) return [];
    const expected = Number(this.env.EMBEDDING_DIMENSIONS ?? 384);
    if (input.vector.length !== expected) throw new ConflictError(`vector_dimensions_must_equal_${expected}`);
    const namespace = await userNamespace(this.userId);
    try {
      const result = await this.env.VECTORIZE.query(input.vector, {
        topK: Math.min(50, topK * 4), namespace, returnMetadata: 'none'
      });
      const vectorIds = result.matches.map((m) => m.id);
      if (!vectorIds.length) return [];
      const placeholders = vectorIds.map(() => '?').join(',');
      const contextSql = input.context ? ` AND json_extract(r.metadata_json,'$.context')=?` : '';
      const typeSql = input.type ? ` AND r.record_type=?` : '';
      const binds: unknown[] = [this.userId, ...vectorIds];
      if (input.type) binds.push(input.type);
      if (input.context) binds.push(input.context);
      const rows = await this.env.DB.prepare(
        `SELECT c.id AS chunk_id,c.vector_id FROM chunks c JOIN records r ON r.user_id=c.user_id AND r.id=c.record_id
         WHERE c.user_id=? AND c.vector_id IN (${placeholders}) AND r.deleted_at IS NULL${typeSql}${contextSql}`
      ).bind(...binds).all<{ chunk_id: string; vector_id: string }>();
      const byVector = new Map(rows.results.map((r) => [r.vector_id, r.chunk_id]));
      return vectorIds.map((id) => byVector.get(id)).filter((id): id is string => Boolean(id));
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      return [];
    }
  }

  async search(input: SearchInput): Promise<{ results: SearchResult[]; metrics: { d1_rows_read: number; vector_dimensions_queried: number } }> {
    const topK = maxTopK(input.top_k);
    const [lexical, vector] = await Promise.all([
      this.lexicalSearch(input, topK),
      this.vectorSearch(input, topK),
    ]);
    const k = Number(this.env.RRF_K ?? 60);
    const fused = weightedRrf(lexical.ids, vector, k);
    if (!fused.length) return { results: [], metrics: { d1_rows_read: lexical.rowsRead, vector_dimensions_queried: input.vector?.length ?? 0 } };
    const chunkIds = fused.slice(0, Math.min(100, topK * 6)).map((x) => x.id);
    const placeholders = chunkIds.map(() => '?').join(',');
    const rows = await this.env.DB.prepare(
      `SELECT DISTINCT r.* , c.id AS chunk_id FROM chunks c JOIN records r ON r.user_id=c.user_id AND r.id=c.record_id
       WHERE c.user_id=? AND c.id IN (${placeholders}) AND r.deleted_at IS NULL`
    ).bind(this.userId, ...chunkIds).all<RecordRow & { chunk_id: string }>();
    const byChunk = new Map(rows.results.map((r) => [r.chunk_id, r]));
    const byRecord = new Map<string, SearchResult>();
    for (const rank of fused) {
      const row = byChunk.get(rank.id);
      if (!row) continue;
      const metadata = safeJson(row.metadata_json);
      const score = rank.score * rankingBoost(row.record_type, input.query, metadata);
      const existing = byRecord.get(row.id);
      const result: SearchResult = {
        id: row.id, type: row.record_type, content: row.content, metadata, version: row.version,
        created_at: row.created_at, updated_at: row.updated_at, content_hash: row.content_hash,
        score, lexical_rank: rank.lexicalRank, vector_rank: rank.vectorRank
      };
      if (!existing || result.score > existing.score) byRecord.set(row.id, result);
    }
    const results = [...byRecord.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, topK);
    return { results, metrics: { d1_rows_read: lexical.rowsRead + Number(rows.meta?.rows_read ?? 0), vector_dimensions_queried: input.vector?.length ?? 0 } };
  }

  async list(type?: string, context?: string, limit = 100, offset = 0): Promise<RecordRow[]> {
    const typeSql = type ? ' AND record_type=?' : '';
    const contextSql = context ? ` AND json_extract(metadata_json,'$.context')=?` : '';
    const binds: unknown[] = [this.userId];
    if (type) binds.push(type);
    if (context) binds.push(context);
    binds.push(Math.min(500, Math.max(1, limit)), Math.max(0, offset));
    const rows = await this.env.DB.prepare(
      `SELECT * FROM records WHERE user_id=? AND deleted_at IS NULL${typeSql}${contextSql} ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`
    ).bind(...binds).all<RecordRow>();
    return rows.results;
  }

  async sync(cursor?: string, limit = 200): Promise<{ records: RecordRow[]; tombstones: unknown[]; next_cursor: string | null }> {
    const decoded = cursor ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))) as { t: string; id: string } : null;
    const effectiveLimit = Math.min(500, Math.max(1, limit));
    const recordSql = decoded
      ? `SELECT * FROM records WHERE user_id=? AND deleted_at IS NULL AND (updated_at>? OR (updated_at=? AND id>?)) ORDER BY updated_at,id LIMIT ?`
      : `SELECT * FROM records WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at,id LIMIT ?`;
    const tombSql = decoded
      ? `SELECT * FROM tombstones WHERE user_id=? AND (deleted_at>? OR (deleted_at=? AND id>?)) ORDER BY deleted_at,id LIMIT ?`
      : `SELECT * FROM tombstones WHERE user_id=? ORDER BY deleted_at,id LIMIT ?`;
    const recordBinds = decoded ? [this.userId, decoded.t, decoded.t, decoded.id, effectiveLimit] : [this.userId, effectiveLimit];
    const tombBinds = decoded ? [this.userId, decoded.t, decoded.t, decoded.id, effectiveLimit] : [this.userId, effectiveLimit];
    const [records, tombstones] = await Promise.all([
      this.env.DB.prepare(recordSql).bind(...recordBinds).all<RecordRow>(),
      this.env.DB.prepare(tombSql).bind(...tombBinds).all<any>(),
    ]);
    const events = [
      ...records.results.map((r) => ({ t: r.updated_at, id: r.id })),
      ...tombstones.results.map((r: any) => ({ t: String(r.deleted_at), id: String(r.id) })),
    ].sort((a, b) => a.t.localeCompare(b.t) || a.id.localeCompare(b.id));
    const last = events.at(-1);
    const next = last ? btoa(JSON.stringify(last)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : null;
    return { records: records.results, tombstones: tombstones.results, next_cursor: next };
  }

  async ack(deviceId: string, cursor: string): Promise<void> {
    await this.ensureUser();
    await this.env.DB.prepare(
      `INSERT INTO sync_state(user_id,device_id,cursor,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(user_id,device_id) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at`
    ).bind(this.userId, deviceId, cursor, nowIso()).run();
  }
}
