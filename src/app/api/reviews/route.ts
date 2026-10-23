import { route } from '@/lib/http';
import { createReviewInput } from '@/lib/schemas';
import { createReview, listReviews } from '@/lib/services';

export const GET = route(async ({ ctx, actor }) => {
  const reviews = await listReviews(ctx, actor);
  return { reviews: reviews.map(({ text, ...r }) => { void text; return r; }) };
});

export const POST = route(async ({ req, ctx, actor }) => {
  const input = createReviewInput.parse(await req.json());
  return { review: await createReview(ctx, actor, input) };
});
