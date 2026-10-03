import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toAvaKnowledge } from './adapters/ava';
import { toMyThoughtsMemory } from './adapters/my-thoughts';
import { PersonalDB } from './personaldb';
import type { AuthContext, Env } from './types';

function text(value: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }; }

export function createPersonalDbMcp(env: Env, auth: AuthContext): McpServer {
  const db = new PersonalDB(env, auth);
  const server = new McpServer({ name: 'personaldb-memory', version: '0.1.0' });

  server.registerTool('memory_add', {
    description: 'Add a distilled memory to the shared persistent store.',
    inputSchema: z.object({
      content: z.string(), context: z.string().optional(), source: z.string().optional(),
      importance: z.number().int().min(1).max(10).optional(), confidence: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(), memory_id: z.string().optional()
    })
  }, async (args) => {
    const out = await db.upsert({ id: args.memory_id, type: 'memory', version: 1, device_id: 'chatgpt-mcp', content: args.content,
      metadata: { context: args.context ?? 'general', source: args.source ?? 'manual', importance: args.importance ?? 5, confidence: args.confidence ?? 1, tags: args.tags ?? [] } });
    return text(toMyThoughtsMemory(out.record));
  });

  server.registerTool('memory_get', { description: 'Retrieve a memory by id.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => {
    const row = await db.getRecord(id); return text(row ? toMyThoughtsMemory(row) : null);
  });

  server.registerTool('memory_search', { description: 'Search memories with hybrid retrieval when a vector is supplied, otherwise FTS5.', inputSchema: z.object({ query: z.string(), context: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }) }, async (args) => {
    const out = await db.search({ query: args.query, context: args.context, type: 'memory', top_k: args.limit ?? 10 });
    return text(out.results.map(toMyThoughtsMemory));
  });

  server.registerTool('memory_list', { description: 'List memories.', inputSchema: z.object({ context: z.string().optional(), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() }) }, async (args) => {
    const rows = await db.list('memory', args.context, args.limit ?? 100, args.offset ?? 0); return text(rows.map(toMyThoughtsMemory));
  });

  server.registerTool('memory_update', { description: 'Update an existing memory.', inputSchema: z.object({ id: z.string(), content: z.string().optional(), context: z.string().optional(), importance: z.number().int().optional(), confidence: z.number().optional(), tags: z.array(z.string()).optional() }) }, async (args) => {
    const row = await db.getRecord(args.id); if (!row) return text(null);
    const current = toMyThoughtsMemory(row);
    const out = await db.upsert({ id: row.id, type: 'memory', version: row.version + 1, device_id: 'chatgpt-mcp', content: args.content ?? row.content,
      metadata: { context: args.context ?? current.context, source: current.source, importance: args.importance ?? current.importance, confidence: args.confidence ?? current.confidence, tags: args.tags ?? current.tags } });
    return text(toMyThoughtsMemory(out.record));
  });

  server.registerTool('memory_delete', { description: 'Delete a memory by id.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => {
    const row = await db.getRecord(id); const out = await db.delete(id, (row?.version ?? 0) + 1, 'chatgpt-mcp'); return text(out.status === 'deleted' || out.status === 'idempotent_noop');
  });

  server.registerTool('memory_health', { description: 'Health and per-user memory statistics.', inputSchema: z.object({}) }, async () => {
    const rows = await db.list('memory', undefined, 500, 0); const by: Record<string, number> = {};
    for (const row of rows) { const m = toMyThoughtsMemory(row); by[m.context] = (by[m.context] ?? 0) + 1; }
    return text({ ok: true, db_path: 'cloudflare:d1', total_memories: rows.length, by_context: by, fts5_enabled: true });
  });

  server.registerTool('knowledge_search', { description: 'Search Ava business knowledge.', inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(50).optional() }) }, async ({ query, limit }) => {
    const out = await db.search({ query, type: 'business_knowledge', top_k: limit ?? 10 }); return text(out.results.map(toAvaKnowledge));
  });
  server.registerTool('knowledge_list', { description: 'List Ava business knowledge.', inputSchema: z.object({ limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() }) }, async ({ limit, offset }) => {
    const rows = await db.list('business_knowledge', undefined, limit ?? 100, offset ?? 0); return text(rows.map(toAvaKnowledge));
  });

  server.registerTool('personaldb_search', { description: 'Hybrid PersonalDB search. Pass the on-device query vector to enable Vectorize + RRF; omit it for FTS5-only fallback.', inputSchema: z.object({ query: z.string(), vector: z.array(z.number()).optional(), top_k: z.number().int().min(1).max(50).optional(), type: z.string().optional() }) }, async (args) => text(await db.search(args)));
  server.registerTool('personaldb_sync', { description: 'Fetch incremental changes since a cursor.', inputSchema: z.object({ cursor: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }) }, async ({ cursor, limit }) => text(await db.sync(cursor, limit ?? 200)));
  return server;
}
