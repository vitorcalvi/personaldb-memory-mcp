import type { AuthContext, Env } from './types';

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function decodeJson(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>;
}

export async function verifyRequest(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new Error('unauthorized');
  if (!env.AUTH_HMAC_SECRET || env.AUTH_HMAC_SECRET.length < 24) throw new Error('auth_not_configured');
  const parts = match[1].split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('unauthorized');
  const protectedHeader = decodeJson(parts[0]);
  if (protectedHeader.alg !== 'HS256') throw new Error('unauthorized');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.AUTH_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'HMAC', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('unauthorized');
  const payload = decodeJson(parts[1]);
  if (payload.iss !== 'personaldb' || typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) {
    throw new Error('unauthorized');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('token_expired');
  return { userId: payload.sub };
}

export function assertNoUserId(value: unknown): void {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'user_id')) {
    throw new Error('user_id_must_come_from_verified_identity');
  }
}
