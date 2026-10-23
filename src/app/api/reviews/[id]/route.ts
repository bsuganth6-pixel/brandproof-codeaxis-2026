import { route } from '@/lib/http';
import { updateReviewInput } from '@/lib/schemas';
import { reviewView, updateDraft } from '@/lib/services';

type P = { id: string };

export const GET = route<P>(async ({ ctx, actor, params }) => reviewView(ctx, actor, params.id));

export const PATCH = route<P>(async ({ req, ctx, actor, params }) => {
  const patch = updateReviewInput.parse(await req.json());
  return { review: await updateDraft(ctx, actor, params.id, patch) };
});
