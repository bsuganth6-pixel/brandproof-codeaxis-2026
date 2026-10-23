import { route } from '@/lib/http';
import { decideFindingInput } from '@/lib/schemas';
import { decideFinding } from '@/lib/services';

export const POST = route<{ id: string; fid: string }>(async ({ req, ctx, actor, params }) => {
  const input = decideFindingInput.parse(await req.json());
  return { review: await decideFinding(ctx, actor, params.id, params.fid, input) };
});
