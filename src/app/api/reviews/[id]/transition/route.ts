import { route } from '@/lib/http';
import { transitionInput } from '@/lib/schemas';
import { transitionReview } from '@/lib/services';

export const POST = route<{ id: string }>(async ({ req, ctx, actor, params }) => {
  const { action, rationale } = transitionInput.parse(await req.json());
  return { review: await transitionReview(ctx, actor, params.id, action, rationale) };
});
