import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { fmtDuration, pct, STATUS_LABEL } from '@/lib/format';
import { getInsights } from '@/lib/services';
import { pageActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

const SEV_BAR = { critical: 'bg-magenta', major: 'bg-yellow', minor: 'bg-cyan' } as const;

function Ledger({ title, rows }: { title: string; rows: { k: string; v: string; how: ReactNode }[] }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <table className="mt-3 w-full table-fixed overflow-hidden rounded-lg border border-line bg-white text-left text-sm">
        <colgroup><col className="w-[58%] md:w-[34%]" /><col className="w-[42%] md:w-[14%]" /><col className="hidden md:table-column" /></colgroup>
        <thead className="border-b border-line bg-bench/60 text-ink-2"><tr><th className="px-4 py-2 font-medium">Measure</th><th className="px-4 py-2 font-medium">Value</th><th className="hidden px-4 py-2 font-medium md:table-cell">How it is calculated</th></tr></thead>
        <tbody className="divide-y divide-line-2">
          {rows.map((r) => (
            <tr key={r.k} className="align-top">
              <td className="px-4 py-3 font-medium">{r.k}<span className="mt-1 block text-xs font-normal text-ink-2 md:hidden">{r.how}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-lg font-semibold">{r.v}</td>
              <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{r.how}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Bars({ items, tone }: { items: { label: string; value: number; tone?: string }[]; tone: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
          <span className="truncate">{i.label}</span><span className="font-semibold">{i.value}</span>
          <div className="col-span-2 h-2 rounded-sm bg-line-2"><div className={`h-2 rounded-sm ${i.tone ?? tone}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function InsightsPage() {
  const { ctx, actor } = await pageActor();
  const i = await getInsights(ctx, actor);
  const d = i.decisions;
  const trendMax = Math.max(1, ...i.trend.map((t) => t.first));

  return (
    <Shell actor={actor}>
      <h1 className="text-3xl font-bold tracking-tight">Governance insights</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Computed live from {i.totals.reviews} stored reviews and their decisions. Nothing here is estimated.</p>

      <div className="mt-8 space-y-10">
        <Ledger title="Evidence behind every finding" rows={[
          { k: 'Findings that quote the draft and cite the brand guide', v: pct(i.evidence.coverage), how: `${i.evidence.withEvidence} of ${i.evidence.findings} findings carry a verified quote and a brand-guide source.` },
          { k: 'Model suggestions that passed verification', v: pct(i.ai.verifiedRate), how: `${i.ai.verified} of ${i.ai.proposed} suggestions quoted text that is really in the draft. ${i.ai.rejected} were dropped before anyone saw them.` },
          { k: 'Model findings that people kept', v: pct(i.ai.keptRate), how: 'Share of verified model findings that no one dismissed. A low number means the model is noisy.' },
        ]} />

        <Ledger title="Who decided, and how fast" rows={[
          { k: 'Decisions on record', v: String(d.total), how: `${d.approved} approved, ${d.changesRequested} sent back for changes, ${d.rejected} rejected.` },
          { k: 'Decisions bound to a person and a fingerprint', v: pct(d.hashBoundRate), how: 'Every decision stores the approver, the SHA-256 of the exact text and the fingerprint of the rules it was checked against.' },
          { k: 'Median time from submission to decision', v: fmtDuration(d.medianWaitMs), how: `Mean ${fmtDuration(d.meanWaitMs)}. Measured from the submit event to the decision event.` },
          { k: 'Critical findings overridden by an approver', v: pct(d.overrideRate), how: `${d.overrides} of ${d.criticalFindings} critical findings were overridden, each with a written reason.` },
        ]} />

        <Ledger title="Quality of the copy" rows={[
          { k: 'First drafts with no critical or major findings', v: pct(i.quality.firstPassCleanRate), how: 'Counted on the first analysis of each review, before any fixes.' },
          { k: 'Issues removed before approval', v: pct(i.quality.issuesRemovedRate), how: 'Findings on the first analysis of approved reviews, minus the findings still present at approval.' },
          { k: 'Findings per 100 words in first drafts', v: i.quality.findingsPer100Words == null ? '—' : i.quality.findingsPer100Words.toFixed(1), how: 'First-analysis findings divided by words written, across all analyzed reviews.' },
        ]} />

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="hot-h" className="rounded-lg border border-line bg-white p-5">
            <h2 id="hot-h" className="text-lg font-semibold">Rules that fire most</h2>
            <div className="mt-4">
              {i.hotRules.length ? <Bars tone="bg-ink" items={i.hotRules.map((r) => ({ label: r.title, value: r.count, tone: SEV_BAR[r.severity] }))} /> : <p className="text-sm text-ink-2">No findings yet.</p>}
            </div>
          </section>
          <section aria-labelledby="sev-h" className="rounded-lg border border-line bg-white p-5">
            <h2 id="sev-h" className="text-lg font-semibold">Findings by severity</h2>
            <div className="mt-4"><Bars tone="bg-ink" items={(['critical', 'major', 'minor'] as const).map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: i.severity[s], tone: SEV_BAR[s] }))} /></div>
            <h3 className="mt-6 text-sm font-semibold text-ink-2">Where reviews stand</h3>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {Object.entries(i.totals.byStatus).map(([k, v]) => <li key={k} className="flex justify-between"><span>{STATUS_LABEL[k]}</span><span className="font-semibold">{v}</span></li>)}
            </ul>
          </section>
        </div>

        <section aria-labelledby="trend-h" className="rounded-lg border border-line bg-white p-5">
          <h2 id="trend-h" className="text-lg font-semibold">Findings per review, first analysis against now</h2>
          <ul className="mt-4 space-y-4">
            {i.trend.map((t) => (
              <li key={t.reviewId} className="text-sm">
                <div className="flex justify-between gap-3"><span className="truncate font-medium">{t.title}</span><span className="text-ink-2">{t.first} then {t.now}</span></div>
                <div className="mt-1.5 space-y-1">
                  <div className="h-1.5 rounded-sm bg-line-2"><div className="h-1.5 rounded-sm bg-ink-2" style={{ width: `${(t.first / trendMax) * 100}%` }} /></div>
                  <div className="h-1.5 rounded-sm bg-line-2"><div className="h-1.5 rounded-sm bg-teal" style={{ width: `${(t.now / trendMax) * 100}%` }} /></div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-2">Grey is the first analysis, green is the current state. A shrinking green bar means the copy was fixed before it shipped.</p>
        </section>
      </div>
    </Shell>
  );
}
