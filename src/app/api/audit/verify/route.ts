import { route } from '@/lib/http';
import { verifyWorkspaceChain } from '@/lib/services';

export const GET = route(async ({ ctx, actor }) => verifyWorkspaceChain(ctx, actor));
