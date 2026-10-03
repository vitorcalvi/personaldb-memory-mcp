import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from 'agents/mcp/server';
import { assertNoUserId, verifyRequest } from './auth';
import { createPersonalDbMcp } from './mcp';
import { handleOAuthRequest, type OAuthProps } from './oauth';
import { ConflictError, PersonalDB } from './personaldb';
import type { Env, SearchInput, UpsertInput } from './types';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const REQUIRED_MCP_SCOPES = ['memory.read', 'memory.write'];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}

async function body<T>(request: Request): Promise<T> {
  const value = await request.json();
  assertNoUserId(value);
  return value as T;
}

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

type OAuthExecutionContext = ExecutionContext & {
  props?: OAuthProps;
  auth?: { scope: string[] };
};

const mcpApiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const oauthContext = ctx as OAuthExecutionContext;
    if (!oauthContext.props?.userId) return json({ error: 'unauthorized' }, 401);
    const granted = new Set(oauthContext.auth?.scope ?? []);
    if (!REQUIRED_MCP_SCOPES.every((scope) => granted.has(scope))) {
      return json({ error: 'insufficient_scope', required: REQUIRED_MCP_SCOPES }, 403);
    }
    const handler = createMcpHandler(() => createPersonalDbMcp(env, oauthContext.props as OAuthProps));
    return handler(request, env, ctx);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const oauthResponse = await handleOAuthRequest(request, env);
    if (oauthResponse) return oauthResponse;

    const url = new URL(request.url);
    if (url.pathname === '/healthz') return json({ ok: true, service: 'personaldb-memory-mcp' });
    try {
      return await api(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal_error';
      if (message === 'unauthorized' || message === 'token_expired') return json({ error: 'unauthorized' }, 401);
      if (message === 'auth_not_configured') return json({ error: 'service_auth_not_configured' }, 503);
      if (error instanceof ConflictError || message === 'user_id_must_come_from_verified_identity') return json({ error: message }, 409);
      return json({ error: 'internal_error' }, 500);
    }
  },
};

const providers = new Map<string, OAuthProvider<Env>>();

function providerFor(request: Request): OAuthProvider<Env> {
  const origin = new URL(request.url).origin;
  const resource = new URL('/mcp', origin).href;
  const cached = providers.get(resource);
  if (cached) return cached;

  const provider = new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler: mcpApiHandler,
    defaultHandler,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    scopesSupported: ['memory.read', 'memory.write', 'offline_access'],
    requiredScopes: REQUIRED_MCP_SCOPES,
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource,
      authorization_servers: [origin],
      resource_name: 'PersonalDB Memory',
    },
  });
  providers.set(resource, provider);
  return provider;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return providerFor(request).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
