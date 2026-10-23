import type { ReactNode } from 'react';
import { shortHash, STATUS_LABEL } from '@/lib/format';
import type { ReviewStatus, Severity } from '@/lib/types';

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-40',
  danger: 'inline-flex items-center justify-center gap-2 rounded-md border border-magenta-ink px-4 py-2 text-sm font-medium text-magenta-ink transition hover:bg-magenta-soft disabled:cursor-not-allowed disabled:opacity-40',
  small: 'inline-flex items-center justify-center rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-40',
};
export const field = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-2/70 focus:border-ink';

const STATUS_STYLE: Record<ReviewStatus, string> = {
  draft: 'bg-line-2 text-ink-2',
  analyzed: 'bg-cyan-soft text-cyan-ink',
  in_review: 'bg-yellow-soft text-yellow-ink',
  changes_requested: 'bg-magenta-soft text-magenta-ink',
  approved: 'bg-teal-soft text-teal',
  rejected: 'bg-magenta text-white',
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const DOT: Record<Severity, string> = { critical: 'bg-magenta', major: 'bg-yellow ring-1 ring-[#c29b00]', minor: 'bg-cyan' };
const SEV_TEXT: Record<Severity, string> = { critical: 'text-magenta-ink', major: 'text-yellow-ink', minor: 'text-cyan-ink' };
export const SEV_LABEL: Record<Severity, string> = { critical: 'Critical', major: 'Major', minor: 'Minor' };

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${SEV_TEXT[severity]}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${DOT[severity]}`} aria-hidden />
      {SEV_LABEL[severity]}
    </span>
  );
}

/** The proof strip: a colour bar sized by how many open findings sit in each severity. */
export function Strip({ critical, major, minor, className = '' }: { critical: number; major: number; minor: number; className?: string }) {
  const total = critical + major + minor;
  return (
    <div className={`flex h-1.5 w-full overflow-hidden rounded-sm bg-line-2 ${className}`} role="img"
      aria-label={total ? `${critical} critical, ${major} major, ${minor} minor open findings` : 'No open findings'}>
      {total === 0 ? <div className="h-full w-full bg-teal" /> : (
        <>
          {critical > 0 && <div className="h-full bg-magenta" style={{ flexGrow: critical }} />}
          {major > 0 && <div className="h-full bg-yellow" style={{ flexGrow: major }} />}
          {minor > 0 && <div className="h-full bg-cyan" style={{ flexGrow: minor }} />}
        </>
      )}
    </div>
  );
}

export function Hash({ value, full = false }: { value?: string; full?: boolean }) {
  return <code className={`${full ? 'break-all' : 'whitespace-nowrap'} rounded bg-line-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2`} title={value}>{full ? value : shortHash(value)}</code>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  const t = { info: 'border-cyan bg-cyan-soft text-cyan-ink', warn: 'border-[#c29b00] bg-yellow-soft text-yellow-ink', bad: 'border-magenta bg-magenta-soft text-magenta-ink', good: 'border-teal bg-teal-soft text-teal' }[tone];
  return <div className={`rounded-md border-l-4 px-3 py-2 text-sm ${t}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function RegMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="6.5" stroke="#1f2429" strokeWidth="1.4" />
      <path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" stroke="#1f2429" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.2" fill="#d81b60" />
    </svg>
  );
}
