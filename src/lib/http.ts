import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCtx } from './ctx';
import { AppError } from './errors';
import type { Actor, Ctx } from './services';
import { actorFromCookie } from './session';

const hits = new Map<string, number[]>();
/** Best-effort per-instance limiter (serverless instances do not share memory). */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
  recent.push(now);
  hits.set(key, recent);
}

function assertSameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin) {
    if (!host || new URL(origin).host !== host) throw new AppError(403, 'bad_origin', 'Cross-site request blocked.');
  } else if (req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(403, 'bad_origin', 'Cross-site request blocked.');
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: 'invalid_input', message: e.issues[0]?.message ?? 'Invalid input.' } }, { status: 422 });
  }
  console.error('Unhandled API error:', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong on our side. Try again.' } }, { status: 500 });
}

interface Args<P> { req: Request; ctx: Ctx; actor: Actor; params: P }

export function route<P = Record<string, never>>(handler: (a: Args<P>) => Promise<unknown>, opts: { auth?: boolean } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await getCtx();
      let actor: Actor | null = null;
      if (opts.auth !== false) {
        actor = await actorFromCookie(ctx);
        if (!actor) throw new AppError(401, 'unauthenticated', 'Sign in to continue.');
      }
      const params = await context.params;
      return NextResponse.json((await handler({ req, ctx, actor: actor as Actor, params })) ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
