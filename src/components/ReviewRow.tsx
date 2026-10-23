import Link from 'next/link';
import { CHANNEL_LABEL, fmtDay } from '@/lib/format';
import type { Review } from '@/lib/types';
import { StatusBadge, Strip } from './ui';

export function openCounts(r: Review) {
  const open = r.findings.filter((f) => !f.decision);
  return {
    critical: open.filter((f) => f.severity === 'critical').length,
    major: open.filter((f) => f.severity === 'major').length,
    minor: open.filter((f) => f.severity === 'minor').length,
    total: open.length,
  };
}

export function ReviewRow({ r }: { r: Review }) {
  const c = openCounts(r);
  const summary = !r.analysis ? 'Not analyzed yet' : c.total === 0 ? 'No open findings' : c.critical ? `${c.critical} critical, ${c.total} open` : `${c.total} open`;
  return (
    <li>
      <Link href={`/reviews/${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-bench/60 sm:grid-cols-[minmax(0,1fr)_150px_150px]">
        <div className="min-w-0">
          <div className="truncate font-medium">{r.title}</div>
          <div className="truncate text-sm text-ink-2">{CHANNEL_LABEL[r.channel]} by {r.createdByName}, updated {fmtDay(r.updatedAt)}</div>
        </div>
        <div className="justify-self-end sm:justify-self-start"><StatusBadge status={r.status} /></div>
        <div className="col-span-2 sm:col-span-1">
          <Strip critical={r.analysis ? c.critical : 0} major={r.analysis ? c.major : 0} minor={r.analysis ? c.minor : 0} />
          <div className={`mt-1 text-xs ${c.critical ? 'font-semibold text-magenta-ink' : 'text-ink-2'}`}>{summary}</div>
        </div>
      </Link>
    </li>
  );
}
