import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Hash, Notice } from '@/components/ui';
import { VerifyHash } from '@/components/VerifyHash';
import { AppError } from '@/lib/errors';
import { CHANNEL_LABEL, fmtDate, shortHash } from '@/lib/format';
import { reviewView } from '@/lib/services';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, actor } = await pageActor();
  const { review, chain, approvalValid } = await reviewView(ctx, actor, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const dec = [...review.decisions].reverse().find((d) => d.action === 'approved');

  return (
    <Shell actor={actor}>
      <Link href={`/reviews/${review.id}`} className="no-print text-sm font-medium underline underline-offset-2">Back to the review</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approval certificate</h1>
          <p className="mt-1 text-ink-2">{review.title}, {CHANNEL_LABEL[review.channel]}</p>
        </div>
        {dec && approvalValid && (
          <div className="stamp"><span className="text-lg">Approved</span><span className="text-xs font-medium">{dec.byName}</span><span className="font-mono text-[11px]">{shortHash(dec.contentHash)}</span></div>
        )}
      </div>

      <div className="mt-5">
        {!dec && <Notice tone="warn">This review has not been approved yet.</Notice>}
        {dec && !approvalValid && <Notice tone="bad">This approval no longer applies. The text changed after {dec.byName} approved it on {fmtDate(dec.at)}.</Notice>}
        {dec && approvalValid && <Notice tone="good">Valid. The text below is exactly what {dec.byName} approved on {fmtDate(dec.at)}.</Notice>}
      </div>

      <div className="crop mt-6">
        <div className="sheet px-8 py-7">
          <p className="whitespace-pre-wrap break-words font-serif text-[1.15rem] leading-[1.9]">{review.text}</p>
        </div>
      </div>

      {dec && (
        <dl className="mt-6 grid gap-x-8 gap-y-4 rounded-lg border border-line bg-white p-6 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-2">Approved by</dt><dd className="mt-0.5 font-medium">{dec.byName}, {dec.byRole === 'admin' ? 'brand admin' : dec.byRole}</dd></div>
          <div><dt className="text-ink-2">Approved on</dt><dd className="mt-0.5 font-medium">{fmtDate(dec.at)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-ink-2">Rationale</dt><dd className="mt-0.5">{dec.rationale || 'No rationale recorded.'}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-ink-2">Critical findings overridden by the approver</dt>
            <dd className="mt-0.5">
              {dec.overrides.length === 0 ? 'None.' : (
                <ul className="list-disc space-y-1 pl-5">{dec.overrides.map((o) => <li key={o.findingId}><span className="font-medium">{o.ruleTitle}.</span> {o.reason}</li>)}</ul>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2"><dt className="text-ink-2">Content fingerprint (SHA-256 of the approved text)</dt><dd className="mt-1"><Hash value={dec.contentHash} full /></dd></div>
          <div className="sm:col-span-2"><dt className="text-ink-2">Ruleset fingerprint (the brand rules this text was checked against)</dt><dd className="mt-1"><Hash value={dec.rulesetHash} full /></dd></div>
          <div className="sm:col-span-2">
            <dt className="text-ink-2">Audit trail</dt>
            <dd className="mt-0.5">{chain.ok ? `Verified: ${chain.count} events in an unbroken chain.` : `Broken at event ${chain.brokenAt}.`}</dd>
          </div>
        </dl>
      )}
      {dec && <div className="mt-5"><VerifyHash text={review.text} expected={dec.contentHash} /></div>}
    </Shell>
  );
}
