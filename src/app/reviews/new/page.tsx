import { redirect } from 'next/navigation';
import { NewReviewForm } from '@/components/NewReviewForm';
import { Shell } from '@/components/Shell';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NewReviewPage() {
  const { actor } = await pageActor();
  if (actor.role === 'approver') redirect('/reviews');
  return (
    <Shell actor={actor}>
      <h1 className="text-3xl font-bold tracking-tight">New review</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Paste the copy you want to check. You will run the analysis on the next screen.</p>
      <NewReviewForm />
    </Shell>
  );
}
