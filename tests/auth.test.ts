import { describe, expect, it } from 'vitest';
import { accessSubjectToUserId, authFromAccess } from '../src/auth';

describe('Cloudflare Access identity', () => {
  it('maps a stable Access subject to an opaque stable PersonalDB user id', async () => {
    const first = await accessSubjectToUserId('cf-user-123');
    const second = await accessSubjectToUserId('cf-user-123');
    const other = await accessSubjectToUserId('cf-user-456');

    expect(first).toBe(second);
    expect(first).toMatch(/^usr_[A-Za-z0-9_-]{26}$/);
    expect(first).not.toContain('cf-user-123');
    expect(other).not.toBe(first);
  });

  it('reads identity only from ctx.access', async () => {
    const ctx = {
      access: {
        aud: 'personaldb-test',
        getIdentity: async () => ({
          user_uuid: 'access-user-1',
          email: 'person@example.com',
          name: 'Person Example',
        }),
      },
    } as unknown as ExecutionContext;

    const auth = await authFromAccess(ctx);
    expect(auth.userId).toMatch(/^usr_/);
    expect(auth.name).toBe('Person Example');
    expect(auth.nickname).toBe('person@example.com');
  });

  it('fails closed when Cloudflare Access did not authenticate the request', async () => {
    await expect(authFromAccess({} as ExecutionContext)).rejects.toThrow('unauthorized');
  });
});
