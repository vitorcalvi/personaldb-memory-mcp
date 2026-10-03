import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toAvaKnowledge } from './adapters/ava';
import { toMyThoughtsMemory } from './adapters/my-thoughts';
import { PersonalDB } from './personaldb';
import type { AuthContext, Env } from './types';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const ADDITIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const DESTRUCTIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function createPersonalDbMcp(env: Env, auth: AuthContext): McpServer {
  const db = new PersonalDB(env, auth);
  const server = new McpServer({ name: 'personaldb-memory', version: '0.3.0' });

  server.registerTool('memory_add', {
    title: 'Save memory',
    description: 'Save a new private memory for the authenticated user when they explicitly ask to remember or persist information.',
    annotations: ADDITIVE_WRITE,
    inputSchema: z.object({
      content: z.string(),
      context: z.string().optional(),
      source: z.string().optional(),
      importance: z.number().int().min(1).max(10).optional(),
      confidence: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      memory_id: z.string().optional(),
    }),
  }, async (args) => {
    const out = await db.upsert({
      id: args.memory_id,
      type: 'memory',
      version: 1,
      device_id: 'chatgpt-mcp',
      content: args.content,
      metadata: {
        context: args.context ?? 'general',
        source: args.source ?? 'manual',
        importance: args.importance ?? 5,
        confidence: args.confidence ?? 1,
        tags: args.tags ?? [],
      },
    });
    return text(toMyThoughtsMemory(out.record));
  });

  server.registerTool('memory_get', {
    title: 'Get memory',
    description: 'Retrieve one private memory by its exact id for the authenticated user without modifying it.',
    annotations: READ_ONLY,
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }) => {
    const row = await db.getRecord(id);
    return text(row ? toMyThoughtsMemory(row) : null);
  });

  server.registerTool('memory_search', {
    title: 'Search memories',
    description: 'Search the authenticated user’s private memories by natural-language query without modifying stored data.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      query: z.string(),
      context: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  }, async (args) => {
    const out = await db.search({
      query: args.query,
      context: args.context,
      type: 'memory',
      top_k: args.limit ?? 10,
    });
    return text(out.results.map(toMyThoughtsMemory));
  });

  server.registerTool('memory_list', {
    title: 'List memories',
    description: 'List private memories that belong to the authenticated user, optionally filtered by context.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      context: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  }, async (args) => {
    const rows = await db.list('memory', args.context, args.limit ?? 100, args.offset ?? 0);
    return text(rows.map(toMyThoughtsMemory));
  });

  server.registerTool('memory_update', {
    title: 'Update memory',
    description: 'Modify an existing private memory for the authenticated user. This overwrites the selected memory fields.',
    annotations: DESTRUCTIVE_WRITE,
    inputSchema: z.object({
      id: z.string(),
      content: z.string().optional(),
      context: z.string().optional(),
      importance: z.number().int().min(1).max(10).optional(),
      confidence: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
    }),
  }, async (args) => {
    const row = await db.getRecord(args.id);
    if (!row) return text(null);
    const current = toMyThoughtsMemory(row);
    const out = await db.upsert({
      id: row.id,
      type: 'memory',
      version: row.version + 1,
      device_id: 'chatgpt-mcp',
      content: args.content ?? row.content,
      metadata: {
        context: args.context ?? current.context,
        source: current.source,
        importance: args.importance ?? current.importance,
        confidence: args.confidence ?? current.confidence,
        tags: args.tags ?? current.tags,
      },
    });
    return text(toMyThoughtsMemory(out.record));
  });

  server.registerTool('memory_delete', {
    title: 'Delete memory',
    description: 'Delete one private memory by id for the authenticated user. Deletion is destructive and creates a tombstone.',
    annotations: { ...DESTRUCTIVE_WRITE, idempotentHint: true },
    inputSchema: z.object({ id: z.string() }),
  }, async ({ id }) => {
    const row = await db.getRecord(id);
    const out = await db.delete(id, (row?.version ?? 0) + 1, 'chatgpt-mcp');
    return text(out.status === 'deleted' || out.status === 'idempotent_noop');
  });

  server.registerTool('memory_health', {
    title: 'Check memory service',
    description: 'Check PersonalDB Memory health and private per-user memory counts without changing data.',
    annotations: READ_ONLY,
    inputSchema: z.object({}),
  }, async () => {
    const rows = await db.list('memory', undefined, 500, 0);
    const by: Record<string, number> = {};
    for (const row of rows) {
      const memory = toMyThoughtsMemory(row);
      by[memory.context] = (by[memory.context] ?? 0) + 1;
    }
    return text({ ok: true, total_memories: rows.length, by_context: by, fts5_enabled: true });
  });

  server.registerTool('knowledge_search', {
    title: 'Search business knowledge',
    description: 'Search the authenticated user’s private Ava business knowledge without modifying it.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  }, async ({ query, limit }) => {
    const out = await db.search({ query, type: 'business_knowledge', top_k: limit ?? 10 });
    return text(out.results.map(toAvaKnowledge));
  });

  server.registerTool('knowledge_list', {
    title: 'List business knowledge',
    description: 'List the authenticated user’s private Ava business knowledge without modifying it.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  }, async ({ limit, offset }) => {
    const rows = await db.list('business_knowledge', undefined, limit ?? 100, offset ?? 0);
    return text(rows.map(toAvaKnowledge));
  });

  server.registerTool('personaldb_search', {
    title: 'Search PersonalDB',
    description: 'Search the authenticated user’s PersonalDB records. Supply an on-device query vector for Vectorize plus RRF, or omit it for FTS5-only search.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      query: z.string(),
      vector: z.array(z.number()).optional(),
      top_k: z.number().int().min(1).max(50).optional(),
      type: z.string().optional(),
    }),
  }, async (args) => text(await db.search(args)));

  server.registerTool('personaldb_sync', {
    title: 'Read PersonalDB changes',
    description: 'Read incremental authenticated PersonalDB changes since a cursor without modifying server data.',
    annotations: READ_ONLY,
    inputSchema: z.object({
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  }, async ({ cursor, limit }) => text(await db.sync(cursor, limit ?? 200)));

  return server;
}
