const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time: number): string {
  let value = time;
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out = ENCODING[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

export function ulid(now = Date.now()): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let random = 0n;
  for (const b of bytes) random = (random << 8n) | BigInt(b);
  let suffix = '';
  for (let i = 0; i < 16; i += 1) {
    suffix = ENCODING[Number(random & 31n)] + suffix;
    random >>= 5n;
  }
  return encodeTime(now) + suffix;
}
