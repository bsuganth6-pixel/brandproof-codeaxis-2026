import { route } from '@/lib/http';
import { patchRuleInput } from '@/lib/schemas';
import { setRuleEnabled } from '@/lib/services';

export const PATCH = route<{ id: string }>(async ({ req, ctx, actor, params }) => {
  const { enabled } = patchRuleInput.parse(await req.json());
  return { rule: await setRuleEnabled(ctx, actor, params.id, enabled) };
});
