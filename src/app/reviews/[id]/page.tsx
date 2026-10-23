import { notFound } from 'next/navigation';
import { ReviewWorkbench } from '@/components/ReviewWorkbench';
import { Shell } from '@/components/Shell';
import { AppError } from '@/lib/errors';
import { reviewView } from '@/lib/services';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, actor } = await pageActor();
  const view = await reviewView(ctx, actor, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  return (
    <Shell actor={actor}>
      <ReviewWorkbench {...view} me={{ id: actor.id, role: actor.role }} />
    </Shell>
  );
}
