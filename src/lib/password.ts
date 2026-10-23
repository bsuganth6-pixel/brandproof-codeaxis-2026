import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [s, h] = stored.split(':');
  if (!s || !h) return false;
  const got = scryptSync(pw, Buffer.from(s, 'hex'), 32);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
