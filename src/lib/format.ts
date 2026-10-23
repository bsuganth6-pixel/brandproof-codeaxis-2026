export const shortHash = (h?: string) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '—');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Deterministic IST formatting (no Intl), so server and browser always render identical text. */
export const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} IST`;
};
export const fmtDay = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const fmtDuration = (ms: number | null | undefined) => {
  if (ms == null) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
};
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', analyzed: 'Analyzed', in_review: 'Awaiting approval',
  changes_requested: 'Changes requested', approved: 'Approved', rejected: 'Rejected',
};
export const CHANNEL_LABEL: Record<string, string> = {
  social: 'Social post', email: 'Email', web: 'Web copy', ad: 'Advert', press: 'Press note',
};

import type { AuditEvent } from './types';

/** One plain sentence for an audit event (actor shown separately). Detail never contains draft text, only hashes and quotes from findings. */
export function describeEvent(e: AuditEvent): string {
  const d = e.detail as Record<string, any>;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  switch (e.action) {
    case 'review.created': return 'created the draft';
    case 'review.edited': return d.approvalInvalidated ? 'edited the text, which invalidated the approval' : 'edited the text';
    case 'review.renamed': return `renamed the review to “${d.to}”`;
    case 'review.analyzed':
      return `ran the analysis: ${d.critical} critical, ${d.major} major, ${d.minor} minor`
        + (d.aiRejected ? `. Dropped ${plural(d.aiRejected, 'unverifiable model suggestion')}` : '') + (d.aiError ? '. The model was unavailable' : '');
    case 'finding.dismissed': return `${d.override ? 'overrode' : 'dismissed'} a ${d.severity} finding (“${d.quote ?? 'missing wording'}”): ${d.reason}`;
    case 'finding.reopened': return `reopened a ${d.severity} finding`;
    case 'review.submitted': return 'submitted for approval';
    case 'review.approved': return `approved${d.rationale ? `: ${d.rationale}` : ''}`;
    case 'review.changes_requested': return `requested changes: ${d.rationale}`;
    case 'review.rejected': return `rejected: ${d.rationale}`;
    case 'rule.created': return `added the rule “${d.title}”`;
    case 'rule.enabled': return `turned on the rule “${d.title}”`;
    case 'rule.disabled': return `turned off the rule “${d.title}”`;
    default: return e.action;
  }
}
