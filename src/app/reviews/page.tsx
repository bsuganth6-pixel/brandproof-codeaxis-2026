import Link from 'next/link';
import { ReviewRow } from '@/components/ReviewRow';
import { Shell } from '@/components/Shell';
import { btn } from '@/components/ui';
import { listReviews } from '@/lib/services';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const { ctx, actor } = await pageActor();
  const reviews = await listReviews(ctx, actor);
  return (
    <Shell actor={actor}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
        {actor.role !== 'approver' && <Link href="/reviews/new" className={btn.primary}>New review</Link>}
      </div>
      {reviews.length ? (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">{reviews.map((r) => <ReviewRow key={r.id} r={r} />)}</ul>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-ink-2">No reviews yet. Create a draft to check copy against the brand rules.</p>
      )}
    </Shell>
  );
}
