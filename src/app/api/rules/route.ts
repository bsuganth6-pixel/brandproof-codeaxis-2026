import { route } from '@/lib/http';
import { createRuleInput } from '@/lib/schemas';
import { createTermRule, getBrand } from '@/lib/services';

export const GET = route(async ({ ctx, actor }) => getBrand(ctx, actor));

export const POST = route(async ({ req, ctx, actor }) => {
  const input = createRuleInput.parse(await req.json());
  return { rule: await createTermRule(ctx, actor, input) };
});
