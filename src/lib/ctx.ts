import { randomBytes } from 'node:crypto';
import { MemoryRepo } from './db/memory';
import { MongoRepo } from './db/mongo';
import { getProvider } from './llm';
import { ensureSeeded } from './seed';
import type { Ctx } from './services';

const g = globalThis as unknown as { __bpCtx?: Promise<Ctx> };

/** One context per server process: storage (MongoDB when configured, else in-memory), model provider, clock. */
export function getCtx(): Promise<Ctx> {
  if (!g.__bpCtx) {
    g.__bpCtx = (async () => {
      const uri = process.env.MONGODB_URI?.trim();
      const repo = uri ? new MongoRepo(uri) : new MemoryRepo();
      await ensureSeeded(repo);
      return { repo, llm: getProvider(), now: () => new Date(), id: (p: string) => `${p}_${randomBytes(6).toString('hex')}` };
    })();
    g.__bpCtx.catch(() => { g.__bpCtx = undefined; });
  }
  return g.__bpCtx;
}
