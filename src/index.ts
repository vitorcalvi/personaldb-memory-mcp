import { createMcpHandler } from 'agents/mcp/server';
import { assertNoUserId, authFromAccess } from './auth';
import { createPersonalDbMcp } from './mcp';
import { ConflictError, PersonalDB } from './personaldb';
import type { AuthContext, Env, SearchInput, UpsertInput } from './types';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

async function body<T>(request: Request): Promise<T> {
  const value = await request.json();
  assertNoUserId(value);
  return value as T;
}

async function api(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const db = new PersonalDB(env, auth);
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/v1/records/upsert') {
    return json(await db.upsert(await body<UpsertInput>(request)));
  }
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
    const id = decodeURIComponent(url.pathname.slice('/v1/records/'.length));
    return json(await db.getRecord(id));
  }
  if (request.method === 'GET' && url.pathname === '/v1/sync') {
    return json(await db.sync(url.searchParams.get('cursor') ?? undefined, Number(url.searchParams.get('limit') ?? 200)));
  }
  if (request.method === 'POST' && url.pathname === '/v1/sync/ack') {
    const input = await body<{ device_id: string; cursor: string }>(request);
    await db.ack(input.device_id, input.cursor);
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}

async function authenticated(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const auth = await authFromAccess(ctx);
  const url = new URL(request.url);

  if (url.pathname === '/mcp') {
    const handler = createMcpHandler(() => createPersonalDbMcp(env, auth));
    return handler(request, env, ctx);
  }

  return api(request, env, auth);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return json({ ok: true, service: 'personaldb-memory-mcp', auth: 'cloudflare-access' });
    }

    try {
      return await authenticated(request, env, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error';
      if (message === 'unauthorized') {
        return json(
          { error: 'unauthorized', auth: 'cloudflare_access_required' },
          401,
          { 'x-personaldb-auth': 'cloudflare-access' },
        );
      }
      if (error instanceof ConflictError || message === 'user_id_must_come_from_verified_identity') {
        return json({ error: message }, 409);
      }
      console.error('request_failed', { path: url.pathname, message });
      return json({ error: 'internal_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
