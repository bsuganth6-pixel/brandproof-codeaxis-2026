'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { CHANNEL_LABEL, describeEvent, fmtDate, shortHash } from '@/lib/format';
import type { Can } from '@/lib/services';
import type { AuditEvent, ChainStatus, Finding, Review, Severity } from '@/lib/types';
import { btn, field, Hash, Notice, SEV_LABEL, SeverityTag, StatusBadge, Strip } from './ui';

interface Props {
  review: Review; audit: AuditEvent[]; chain: ChainStatus; can: Can; approvalValid: boolean; rulesetCurrent: boolean;
  canDismiss: { critical: boolean; other: boolean }; me: { id: string; role: 'admin' | 'author' | 'approver' };
}

const ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const bySeverity = (a: Finding, b: Finding) => ORDER[a.severity] - ORDER[b.severity] || (a.span?.start ?? 1e9) - (b.span?.start ?? 1e9);
const PEN: Record<Severity, string> = { critical: 'pen-critical', major: 'pen-major', minor: 'pen-minor' };

export function ReviewWorkbench({ review, audit, chain, can, approvalValid, rulesetCurrent, canDismiss, me }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'proof' | 'edit'>('proof');
  const [draft, setDraft] = useState(review.text);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rationale, setRationale] = useState('');

  useEffect(() => { setDraft(review.text); }, [review.text]);

  const a = review.analysis;
  const stale = !!a && a.contentHash !== review.contentHash;
  const editable = can.edit.ok && (review.status === 'draft' || review.status === 'analyzed');
  const open = review.findings.filter((f) => !f.decision).sort(bySeverity);
  const dismissed = review.findings.filter((f) => f.decision);
  const count = (s: Severity) => open.filter((f) => f.severity === s).length;
  const overridden = review.findings.filter((f) => f.severity === 'critical' && f.decision?.override).length;
  const last = review.decisions[review.decisions.length - 1];

  const segments = useMemo(() => {
    if (!a || stale) return [{ text: review.text } as { text: string; f?: Finding }];
    const spans = review.findings.filter((f) => f.span).sort((x, y) => x.span!.start - y.span!.start);
    const out: { text: string; f?: Finding }[] = [];
    let pos = 0;
    for (const f of spans) {
      const s = f.span!;
      if (s.start < pos || s.end > review.text.length) continue;
      if (s.start > pos) out.push({ text: review.text.slice(pos, s.start) });
      out.push({ text: review.text.slice(s.start, s.end), f });
      pos = s.end;
    }
    if (pos < review.text.length) out.push({ text: review.text.slice(pos) });
    return out;
  }, [review.findings, review.text, a, stale]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(null); }
  }
  const url = `/api/reviews/${review.id}`;
  const analyze = () => run('analyze', () => api(`${url}/analyze`, { method: 'POST' }));
  const save = () => run('save', async () => { await api(url, { method: 'PATCH', body: { text: draft } }); setMode('proof'); });
  const transition = (action: string) => run(action, async () => { await api(`${url}/transition`, { body: { action, rationale } }); setRationale(''); });
  const dismiss = (f: Finding) => run(`dismiss-${f.id}`, async () => { await api(`${url}/findings/${f.id}`, { body: { action: 'dismiss', reason } }); setDismissing(null); setReason(''); });
  const reopen = (f: Finding) => run(`reopen-${f.id}`, () => api(`${url}/findings/${f.id}`, { body: { action: 'reopen' } }));

  const fixText = (f: Finding): string | null => {
    if (f.replacement !== undefined && f.span) return review.text.slice(0, f.span.start) + f.replacement + review.text.slice(f.span.end);
    if (f.append) return `${review.text.trimEnd()} ${f.append}`;
    return null;
  };
  const fixLabel = (f: Finding) => (f.append ? `Add “${f.append}”` : f.replacement === undefined ? null : f.replacement === '' ? 'Remove it' : `Replace with “${f.replacement}”`);
  const applyFix = (f: Finding) => run(`fix-${f.id}`, async () => {
    const t = fixText(f);
    if (t === null) return;
    await api(url, { method: 'PATCH', body: { text: t } });
    await api(`${url}/analyze`, { method: 'POST' });
  });

  function select(id: string, from: 'mark' | 'card') {
    setActive(id);
    const el = document.getElementById(from === 'mark' ? `card-${id}` : `mark-${id}`);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }

  const group = (s: Severity) => open.filter((f) => f.severity === s);
  const parts = (['critical', 'major', 'minor'] as const).filter((s) => count(s) > 0).map((s) => `${count(s)} ${s}`);
  const summary = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

  return (
    <div>
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{review.title}</h1>
            <p className="mt-1 text-sm text-ink-2">{CHANNEL_LABEL[review.channel]} by {review.createdByName}, {review.wordCount} words, updated {fmtDate(review.updatedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={review.status} />
            {approvalValid && <Link href={`/reviews/${review.id}/certificate`} className={btn.secondary}>View approval certificate</Link>}
          </div>
        </div>
        <Strip critical={a && !stale ? count('critical') : 0} major={a && !stale ? count('major') : 0} minor={a && !stale ? count('minor') : 0} />
        <p className="text-sm text-ink-2">
          {!a ? 'Not analyzed yet.' : stale ? 'The text changed after the last analysis.' : open.length === 0 ? 'No open findings.' : `${summary} ${open.length === 1 ? 'finding is' : 'findings are'} open.`}
        </p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <div className="crop">
            <div className="sheet px-7 py-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-2 pb-3">
                <div role="tablist" aria-label="View" className="flex gap-1">
                  <button role="tab" aria-selected={mode === 'proof'} onClick={() => setMode('proof')}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${mode === 'proof' ? 'bg-ink text-white' : 'text-ink-2 hover:bg-bench'}`}>Proof view</button>
                  {can.edit.ok && (
                    <button role="tab" aria-selected={mode === 'edit'} onClick={() => setMode('edit')}
                      className={`rounded-md px-3 py-1 text-sm font-medium ${mode === 'edit' ? 'bg-ink text-white' : 'text-ink-2 hover:bg-bench'}`}>Edit draft</button>
                  )}
                </div>
                <div className="text-xs text-ink-2">Content fingerprint <Hash value={review.contentHash} /></div>
              </div>

              {mode === 'proof' ? (
                <p className="whitespace-pre-wrap break-words font-serif text-[1.12rem] leading-[1.9]">
                  {segments.map((s, i) => s.f ? (
                    <mark key={i} id={`mark-${s.f.id}`} tabIndex={0} role="button"
                      aria-label={`${SEV_LABEL[s.f.severity]} finding: ${s.f.ruleTitle}`}
                      className={`pen ${s.f.decision ? 'pen-dismissed' : PEN[s.f.severity]} ${active === s.f.id ? 'pen-active' : ''}`}
                      onClick={() => select(s.f!.id, 'mark')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.f!.id, 'mark'); } }}>{s.text}</mark>
                  ) : <span key={i}>{s.text}</span>)}
                </p>
              ) : (
                <div className="space-y-3">
                  {review.status !== 'draft' && review.status !== 'analyzed' && (
                    <Notice tone="warn">Saving a change sends this review back to draft{approvalValid ? ' and invalidates the approval' : ''}.</Notice>
                  )}
                  <textarea aria-label="Draft text" className={`${field} min-h-64 font-serif text-[1.05rem] leading-8`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20000} />
                  <div className="flex gap-2">
                    <button className={btn.primary} disabled={!!busy || !draft.trim() || draft === review.text} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
                    <button className={btn.secondary} onClick={() => { setDraft(review.text); setMode('proof'); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!a && <Notice tone="info">Run the analysis to check this draft against the brand rules.</Notice>}
          {stale && <Notice tone="warn">The text changed after the last analysis, so the highlights are hidden. Run the analysis again.</Notice>}
          {a && !rulesetCurrent && !stale && <Notice tone="warn">The brand rules changed after this analysis. Run it again to apply the current rules.</Notice>}
          {a?.aiError && <Notice tone="warn">The model was unavailable ({a.aiError}). Only rule-based findings are shown.</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}

          <section aria-labelledby="next-h" className="rounded-lg border border-line bg-white p-5">
            <h2 id="next-h" className="text-lg font-semibold">Next step</h2>
            {last && (review.status === 'changes_requested' || review.status === 'rejected') && (
              <div className="mt-3 rounded-md border-l-4 border-magenta bg-magenta-soft px-3 py-2 text-sm text-magenta-ink">
                <span className="font-semibold">{last.byName}</span> {last.action === 'rejected' ? 'rejected this' : 'asked for changes'} on {fmtDate(last.at)}: “{last.rationale}”
              </div>
            )}
            {review.status === 'approved' && last && (
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <div className="stamp"><span className="text-lg">Approved</span><span className="text-xs font-medium">{last.byName}</span><span className="font-mono text-[11px]">{shortHash(last.contentHash)}</span></div>
                <p className="max-w-md text-sm text-ink-2">Approved on {fmtDate(last.at)}{last.rationale ? `: “${last.rationale}”` : ''}. The approval is bound to this exact text and becomes invalid if it changes.</p>
              </div>
            )}
            <div className="mt-4 space-y-3">
              {(review.status === 'draft' || review.status === 'analyzed') && can.analyze.ok && (
                <div className="flex flex-wrap gap-2">
                  <button className={review.status === 'draft' || stale ? btn.primary : btn.secondary} disabled={!!busy} onClick={analyze}>
                    {busy === 'analyze' ? 'Analyzing…' : a ? 'Run analysis again' : 'Run analysis'}
                  </button>
                  {review.status === 'analyzed' && (
                    <button className={btn.primary} disabled={!!busy || !can.submit.ok} title={can.submit.reason} onClick={() => transition('submit')}>Submit for approval</button>
                  )}
                </div>
              )}
              {review.status === 'analyzed' && !can.submit.ok && can.submit.reason && <p className="text-sm text-ink-2">{can.submit.reason}</p>}
              {review.status === 'in_review' && me.role === 'author' && (
                <p className="text-sm text-ink-2">Waiting for an approver. Editing the text pulls the review back to draft.</p>
              )}
              {review.status === 'in_review' && me.role !== 'author' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Rationale
                    <textarea className={`${field} mt-1 min-h-20`} value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={1000}
                      placeholder="Why you are deciding this. It goes in the audit trail under your name." />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className={btn.primary} disabled={!!busy || !can.approve.ok || (overridden > 0 && rationale.trim().length < 8)} onClick={() => transition('approve')}>Approve</button>
                    <button className={btn.secondary} disabled={!!busy || !can.request_changes.ok || rationale.trim().length < 8} onClick={() => transition('request_changes')}>Request changes</button>
                    <button className={btn.danger} disabled={!!busy || !can.reject.ok || rationale.trim().length < 8} onClick={() => transition('reject')}>Reject</button>
                  </div>
                  {!can.approve.ok && <p className="text-sm text-ink-2">{can.approve.reason}</p>}
                  {can.approve.ok && overridden > 0 && rationale.trim().length < 8 && <p className="text-sm text-ink-2">You overrode {overridden} critical finding{overridden > 1 ? 's' : ''}, so approving needs a rationale of at least 8 characters.</p>}
                  <p className="text-sm text-ink-2">Requesting changes or rejecting needs a rationale of at least 8 characters.</p>
                </div>
              )}
              {(review.status === 'changes_requested' || review.status === 'rejected') && can.edit.ok && (
                <button className={btn.secondary} onClick={() => setMode('edit')}>Edit the draft</button>
              )}
              {review.status === 'approved' && can.edit.ok && <p className="text-sm text-ink-2">Editing an approved text sends it back to draft and invalidates the approval.</p>}
            </div>
          </section>

          <section aria-labelledby="audit-h">
            <h2 id="audit-h" className="text-lg font-semibold">Audit trail</h2>
            <div className="mt-3">
              <Notice tone={chain.ok ? 'good' : 'bad'}>
                {chain.ok ? `Verified: all ${chain.count} events in this workspace are sealed in an unbroken chain.` : `The chain is broken at event ${chain.brokenAt}. Records may have been altered.`}
              </Notice>
            </div>
            <ol className="mt-3 divide-y divide-line-2 rounded-lg border border-line bg-white">
              {audit.map((e) => (
                <li key={e.id} className="grid gap-x-4 px-4 py-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                  <span className="text-xs text-ink-2 sm:pt-0.5">{fmtDate(e.at)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{e.actorName}</span> <span className="text-ink-2">({e.actorRole})</span> {describeEvent(e)}
                    {typeof e.detail.contentHash === 'string' && <span className="ml-2 align-middle"><Hash value={e.detail.contentHash} /></span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-labelledby="findings-h" className="min-w-0 space-y-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-96px)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <h2 id="findings-h" className="text-lg font-semibold">Findings</h2>
          {a && (
            <div className="rounded-lg border border-line bg-white p-4 text-sm">
              <p>Analyzed {fmtDate(a.at)} by the rule engine and <span className="font-medium">{a.provider}</span> ({a.model}).</p>
              <p className="mt-1 text-ink-2">
                {n(a.stats.rule, 'rule finding')} and {n(a.stats.aiVerified, 'verified model finding')}
                {a.stats.aiRejected > 0 ? `. ${n(a.stats.aiRejected, 'model suggestion')} ${a.stats.aiRejected > 1 ? 'were' : 'was'} dropped because the quoted text is not in the draft` : ''}.
              </p>
              <p className="mt-2 text-xs text-ink-2">Ruleset fingerprint <Hash value={a.rulesetHash} /></p>
            </div>
          )}
          {a && open.length === 0 && dismissed.length === 0 && <Notice tone="good">Nothing in this draft breaks a brand rule.</Notice>}

          {(['critical', 'major', 'minor'] as const).map((s) => group(s).length > 0 && (
            <section key={s} aria-label={`${SEV_LABEL[s]} findings`}>
              <h3 className="mb-2 text-sm font-semibold text-ink-2">{SEV_LABEL[s]}, {group(s).length} open</h3>
              <ul className="space-y-3">
                {group(s).map((f) => {
                  const label = fixLabel(f);
                  const mayDismiss = f.severity === 'critical' ? canDismiss.critical : canDismiss.other;
                  return (
                    <li key={f.id} id={`card-${f.id}`} className={`rounded-lg border bg-white p-4 ${active === f.id ? 'border-ink' : 'border-line'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <SeverityTag severity={f.severity} />
                        <span className="text-xs text-ink-2">{f.origin === 'ai' ? 'Found by the model' : 'Found by a rule'}</span>
                      </div>
                      <h4 className="mt-1 text-sm font-semibold">{f.ruleTitle}</h4>
                      {f.span && <blockquote className="mt-2 border-l-2 border-line pl-3 font-serif text-[0.95rem] leading-6">“{f.span.quote.length > 160 ? `${f.span.quote.slice(0, 160)}…` : f.span.quote}”</blockquote>}
                      <p className="mt-2 text-sm">{f.message}</p>
                      {f.suggestion && <p className="mt-1 text-sm text-ink-2">{f.suggestion}</p>}
                      <details className="mt-3 rounded-md bg-bench/70 text-xs leading-5 text-ink-2" open={f.severity !== 'minor'}>
                        <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-ink">Evidence</summary>
                        <div className="space-y-1 px-3 pb-3">
                          <p><span className="font-semibold text-ink">Brand guide.</span> {f.evidence.ruleSource.doc}: “{f.evidence.ruleSource.quote}”</p>
                          {f.evidence.fact && <p><span className="font-semibold text-ink">Approved fact.</span> {f.evidence.fact.statement} Source: {f.evidence.fact.source.doc}, “{f.evidence.fact.source.quote}”</p>}
                          {f.confidence != null && <p>Model confidence {Math.round(f.confidence * 100)}%</p>}
                        </div>
                      </details>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {f.span && mode === 'proof' && !stale && <button className={btn.small} onClick={() => select(f.id, 'card')}>Show in text</button>}
                        {editable && !stale && label && <button className={btn.small} disabled={!!busy} onClick={() => applyFix(f)}>{label}</button>}
                        {mayDismiss && <button className={btn.small} disabled={!!busy} onClick={() => { setDismissing(dismissing === f.id ? null : f.id); setReason(''); }}>
                          {f.severity === 'critical' ? 'Override…' : 'Dismiss…'}
                        </button>}
                      </div>
                      {f.severity === 'critical' && !mayDismiss && !stale && (
                        <p className="mt-2 text-xs text-ink-2">Only an approver can override a critical finding, while the review awaits approval. Fix the text or submit it for review.</p>
                      )}
                      {dismissing === f.id && (
                        <div className="mt-3 space-y-2">
                          <label className="block text-xs font-medium">Reason, recorded in the audit trail under your name
                            <textarea className={`${field} mt-1 min-h-16`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                          </label>
                          <div className="flex gap-2">
                            <button className={btn.primary} disabled={!!busy || reason.trim().length < 8} onClick={() => dismiss(f)}>{f.severity === 'critical' ? 'Record override' : 'Dismiss finding'}</button>
                            <button className={btn.secondary} onClick={() => setDismissing(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {dismissed.length > 0 && (
            <section aria-label="Dismissed findings">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">Dismissed, {dismissed.length}</h3>
              <ul className="space-y-3">
                {dismissed.map((f) => (
                  <li key={f.id} id={`card-${f.id}`} className="rounded-lg border border-line-2 bg-white/70 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2"><SeverityTag severity={f.severity} /><span className="text-xs text-ink-2">{f.decision!.override ? 'Overridden' : 'Dismissed'}</span></div>
                    <p className="mt-1 font-medium">{f.ruleTitle}</p>
                    {f.span && <p className="mt-1 font-serif text-ink-2 line-through">“{f.span.quote.slice(0, 120)}”</p>}
                    <p className="mt-2 text-ink-2">{f.decision!.byName} ({f.decision!.byRole}), {fmtDate(f.decision!.at)}: “{f.decision!.reason}”</p>
                    {(f.severity === 'critical' ? canDismiss.critical : canDismiss.other) && (
                      <button className={`${btn.small} mt-2`} disabled={!!busy} onClick={() => reopen(f)}>Reopen</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
