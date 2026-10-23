import { rateLimit, route } from '@/lib/http';
import { analyzeReview } from '@/lib/services';

export const maxDuration = 30;

export const POST = route<{ id: string }>(async ({ ctx, actor, params }) => {
  rateLimit(`analyze:${actor.id}`, 12, 60_000);
  return { review: await analyzeReview(ctx, actor, params.id) };
});
