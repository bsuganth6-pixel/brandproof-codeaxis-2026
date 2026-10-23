import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Actor, Ctx } from './services';
import { getCtx } from './ctx';

const COOKIE = 'bp_session';
const TTL_S = 8 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === 'false') throw new Error('SESSION_SECRET (16+ characters) is required when DEMO_MODE=false');
  return 'brandproof-demo-secret-set-SESSION_SECRET';
}
const mac = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function signSession(uid: string, nowMs = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: nowMs + TTL_S * 1000 })).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function readSession(token: string | undefined, nowMs = Date.now()): string | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { uid?: string; exp?: number };
    return p.uid && p.exp && p.exp > nowMs ? p.uid : null;
  } catch {
    return null;
  }
}

export async function setSession(uid: string) {
  (await cookies()).set(COOKIE, signSession(uid), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL_S,
  });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }

export async function actorFromCookie(ctx: Ctx): Promise<Actor | null> {
  const uid = readSession((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  const u = await ctx.repo.getUser(uid);
  return u ? { id: u.id, name: u.name, role: u.role, workspaceId: u.workspaceId } : null;
}

/** For server components: returns the signed-in actor or sends the visitor to /login. */
export async function pageActor(): Promise<{ ctx: Ctx; actor: Actor }> {
  const ctx = await getCtx();
  const actor = await actorFromCookie(ctx);
  if (!actor) redirect('/login');
  return { ctx, actor };
}
