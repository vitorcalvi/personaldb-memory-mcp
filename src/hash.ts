function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function userNamespace(userId: string): Promise<string> {
  return `u_${(await sha256(userId)).slice(0, 40)}`;
}

export async function vectorId(userId: string, chunkId: string): Promise<string> {
  const prefix = (await sha256(userId)).slice(0, 12);
  const suffix = (await sha256(chunkId)).slice(0, 32);
  return `${prefix}:${suffix}`;
}
