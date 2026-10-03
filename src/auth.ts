import type { AuthContext } from './types';

function toBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let raw = '';
  for (const byte of view) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function accessSubjectToUserId(subject: string): Promise<string> {
  const normalized = subject.trim();
  if (!normalized || normalized.length > 512) throw new Error('unauthorized');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`cloudflare-access:${normalized}`),
  );
  return `usr_${toBase64Url(digest).slice(0, 26)}`;
}

export async function authFromAccess(ctx: ExecutionContext): Promise<AuthContext> {
  if (!ctx.access) throw new Error('unauthorized');
  const identity = await ctx.access.getIdentity();
  const subject = identity?.user_uuid?.trim();
  if (!subject) throw new Error('unauthorized');

  return {
    userId: await accessSubjectToUserId(subject),
    name: identity?.name?.trim() || undefined,
    nickname: identity?.email?.trim() || undefined,
  };
}

export function assertNoUserId(value: unknown): void {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'user_id')) {
    throw new Error('user_id_must_come_from_verified_identity');
  }
}
