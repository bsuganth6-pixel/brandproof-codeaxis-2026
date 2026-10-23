import { AppError } from '@/lib/errors';
import { rateLimit, route } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { loginInput } from '@/lib/schemas';
import { WS_ID } from '@/lib/seed';
import { setSession } from '@/lib/session';
import type { User } from '@/lib/types';

export const POST = route(async ({ req, ctx }) => {
  rateLimit(`login:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 60_000);
  const input = loginInput.parse(await req.json());
  let user: User | null = null;
  if ('role' in input) {
    if (process.env.DEMO_MODE === 'false') throw new AppError(403, 'demo_disabled', 'Demo sign-in is switched off. Use your email and password.');
    user = await ctx.repo.getUserByRole(WS_ID, input.role);
  } else {
    const u = await ctx.repo.getUserByEmail(input.email);
    user = u && verifyPassword(input.password, u.passwordHash) ? u : null;
  }
  if (!user) throw new AppError(401, 'bad_credentials', 'The email or password is incorrect.');
  await setSession(user.id);
  return { ok: true, name: user.name, role: user.role };
}, { auth: false });
