import { route } from '@/lib/http';
import { getInsights } from '@/lib/services';

export const GET = route(async ({ ctx, actor }) => getInsights(ctx, actor));
