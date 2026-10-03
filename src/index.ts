import { createMcpHandler } from 'agents/mcp/server';
import { assertNoUserId, verifyRequest } from './auth';
import { createPersonalDbMcp } from './mcp';
import { ConflictError, PersonalDB } from './personaldb';
import type { Env, SearchInput, UpsertInput } from './types';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: jsonHeaders }); }
async function body<T>(request: Request): Promise<T> { const v = await request.json(); assertNoUserId(v); return v as T; }

async function api(request: Request, env: Env): Promise<Response> {
  const auth = await verifyRequest(request, env);
  const db = new PersonalDB(env, auth);
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/v1/records/upsert') return json(await db.upsert(await body<UpsertInput>(request)));
  if (request.method === 'POST' && url.pathname === '/v1/search') {
    const result = await db.search(await body<SearchInput>(request));
    const includeMetrics = request.headers.get('x-benchmark') === '1';
    return json(includeMetrics ? result : { results: result.results });
  }
  if (request.method === 'DELETE' && url.pathname.startsWith('/v1/records/')) {
    const id = decodeURIComponent(url.pathname.slice('/v1/records/'.length));
    const input = await body<{ version: number; device_id: string }>(request);
    return json(await db.delete(id, input.version, input.device_id));
  }
  if (request.method === 'GET' && url.pathname.startsWith('/v1/records/')) {
    const id = decodeURIComponent(url.pathname.slice('/v1/records/'.length)); return json(await db.getRecord(id));
  }
  if (request.method === 'GET' && url.pathname === '/v1/sync') return json(await db.sync(url.searchParams.get('cursor') ?? undefined, Number(url.searchParams.get('limit') ?? 200)));
  if (request.method === 'POST' && url.pathname === '/v1/sync/ack') {
    const input = await body<{ device_id: string; cursor: string }>(request); await db.ack(input.device_id, input.cursor); return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return json({ ok: true, service: 'personaldb-memory-mcp' });
    try {
      const auth = await verifyRequest(request, env);
      if (url.pathname === '/mcp') {
        const handler = createMcpHandler(() => createPersonalDbMcp(env, auth));
        return handler(request, env, ctx);
      }
      return await api(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal_error';
      if (message === 'unauthorized' || message === 'token_expired') return json({ error: 'unauthorized' }, 401);
      if (message === 'auth_not_configured') return json({ error: 'service_auth_not_configured' }, 503);
      if (err instanceof ConflictError || message === 'user_id_must_come_from_verified_identity') return json({ error: message }, 409);
      return json({ error: 'internal_error' }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
