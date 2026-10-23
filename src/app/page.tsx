import Link from 'next/link';
import { ReviewRow } from '@/components/ReviewRow';
import { Shell } from '@/components/Shell';
import { btn, Notice } from '@/components/ui';
import { describeEvent, fmtDate, fmtDuration } from '@/lib/format';
import { getInsights, listReviews, verifyWorkspaceChain } from '@/lib/services';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { ctx, actor } = await pageActor();
  const [reviews, events, chain, ins] = await Promise.all([
    listReviews(ctx, actor), ctx.repo.listAudit(actor.workspaceId, { limit: 8 }), verifyWorkspaceChain(ctx, actor), getInsights(ctx, actor),
  ]);
  const reviewer = actor.role !== 'author';
  const writer = actor.role !== 'approver';
  const toDecide = reviews.filter((r) => r.status === 'in_review' && r.submittedBy !== actor.id);
  const toFinish = reviews.filter((r) => ['draft', 'analyzed', 'changes_requested', 'rejected'].includes(r.status) && (actor.role === 'admin' || r.createdBy === actor.id));
  const openCritical = reviews
    .filter((r) => !['approved', 'rejected'].includes(r.status))
    .reduce((n, r) => n + r.findings.filter((f) => f.severity === 'critical' && !f.decision).length, 0);

  return (
    <Shell actor={actor}>
      <div className="space-y-3">
        {ctx.repo.mode === 'memory' && (
          <Notice tone="warn">This server is using the in-memory demo store, so reviews reset when it restarts. Set MONGODB_URI to keep them.</Notice>
        )}
        {ctx.llm.name === 'mock-offline' && (
          <Notice tone="info">AI analysis is running on the offline keyword heuristic. Set ANTHROPIC_API_KEY, or OPENAI_API_KEY with LLM_MODEL, to use a real model.</Notice>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Worklist</h1>
        {writer && <Link href="/reviews/new" className={btn.primary}>New review</Link>}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ['Awaiting approval', String(ins.totals.byStatus.in_review)],
          ['Approved', String(ins.totals.byStatus.approved)],
          ['Median time to decision', fmtDuration(ins.decisions.medianWaitMs)],
          ['Open critical findings', String(openCritical)],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3">
            <dt className="text-sm text-ink-2">{k}</dt>
            <dd className="mt-0.5 text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          {reviewer && (
            <section aria-labelledby="decide-h">
              <h2 id="decide-h" className="text-lg font-semibold">Waiting for your decision</h2>
              {toDecide.length ? (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">{toDecide.map((r) => <ReviewRow key={r.id} r={r} />)}</ul>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-white/60 px-4 py-5 text-sm text-ink-2">Nothing is waiting for approval. Submitted drafts appear here.</p>
              )}
            </section>
          )}
          {writer && (
            <section aria-labelledby="finish-h">
              <h2 id="finish-h" className="text-lg font-semibold">{actor.role === 'admin' ? 'Drafts in progress' : 'Yours to finish'}</h2>
              {toFinish.length ? (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">{toFinish.map((r) => <ReviewRow key={r.id} r={r} />)}</ul>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-white/60 px-4 py-5 text-sm text-ink-2">No drafts in progress. Start a review to check new copy against the brand rules.</p>
              )}
            </section>
          )}
        </div>

        <section aria-labelledby="activity-h">
          <h2 id="activity-h" className="text-lg font-semibold">Recent activity</h2>
          <div className="mt-3">
            <Notice tone={chain.ok ? 'good' : 'bad'}>
              {chain.ok ? `Audit trail verified: ${chain.count} events, each sealed to the one before it.` : `Audit trail broken at event ${chain.brokenAt}. Records may have been altered.`}
            </Notice>
          </div>
          <ol className="mt-3 divide-y divide-line-2 rounded-lg border border-line bg-white">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <div className="text-xs text-ink-2">{fmtDate(e.at)}</div>
                <div><span className="font-medium">{e.actorName}</span> {describeEvent(e)}</div>
                {e.reviewId && <Link href={`/reviews/${e.reviewId}`} className="text-xs font-medium underline underline-offset-2">Open review</Link>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Shell>
  );
}
