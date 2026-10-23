import { route } from '@/lib/http';

export const GET = route(async ({ ctx }) => {
  const ok = await ctx.repo.ping().catch(() => false);
  return { ok, storage: ctx.repo.mode, llm: { provider: ctx.llm.name, model: ctx.llm.model }, demoMode: process.env.DEMO_MODE !== 'false' };
}, { auth: false });
