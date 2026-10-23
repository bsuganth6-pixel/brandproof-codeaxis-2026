import { AppError, DuplicateSeqError } from './errors';
import type { Repo } from './db/repo';
import type { LLMProvider } from './llm/types';
import type {
  Analysis, AuditEvent, Channel, Fact, Review, ReviewDecision, Role, Rule, Severity, Workspace,
} from './types';
import { runAI, mergeFindings, type AIOutcome } from './core/ai';
import { eventHash, GENESIS, verifyChain } from './core/audit';
import { idGen, runRules } from './core/engine';
import { contentHash, hashRuleset } from './core/hash';
import { computeInsights } from './core/metrics';
import { guard, isApprovalValid, type Action } from './core/statemachine';

export interface Ctx { repo: Repo; llm: LLMProvider; now: () => Date; id: (prefix: string) => string }
export interface Actor { id: string; name: string; role: Role; workspaceId: string }

const wc = (t: string) => (t.match(/\S+/g) ?? []).length;
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function audit(ctx: Ctx, actor: Actor, action: string, reviewId: string | undefined, detail: Record<string, unknown>) {
  const clean = plain(detail);
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await ctx.repo.lastAudit(actor.workspaceId);
    const base: Omit<AuditEvent, 'hash'> = {
      id: ctx.id('evt'), workspaceId: actor.workspaceId, seq: (last?.seq ?? 0) + 1, at: ctx.now().toISOString(),
      actorId: actor.id, actorName: actor.name, actorRole: actor.role, action,
      ...(reviewId ? { reviewId } : {}), detail: clean, prevHash: last?.hash ?? GENESIS,
    };
    try {
      await ctx.repo.appendAudit({ ...base, hash: eventHash(base) });
      return;
    } catch (e) {
      if (!(e instanceof DuplicateSeqError) || attempt === 4) throw e;
    }
  }
}

async function load(ctx: Ctx, actor: Actor, id: string): Promise<Review> {
  const r = await ctx.repo.getReview(id);
  if (!r || r.workspaceId !== actor.workspaceId) throw new AppError(404, 'not_found', 'Review not found.');
  return r;
}

const openCritical = (r: Review) => r.findings.filter((f) => f.severity === 'critical' && !f.decision).length;
const analysisCurrent = (r: Review) => !!r.analysis && r.analysis.contentHash === r.contentHash;

function check(review: Review, action: Action, actor: Actor, rationale?: string) {
  const g = guard(review, action, { actor, openCritical: openCritical(review), analysisCurrent: analysisCurrent(review), rationale });
  if (!g.ok) throw new AppError(g.status, g.code, g.message);
  return g.next;
}

/* ---------- reviews ---------- */

export async function createReview(ctx: Ctx, actor: Actor, input: { title: string; channel: Channel; text: string }): Promise<Review> {
  if (actor.role === 'approver') throw new AppError(403, 'forbidden_role', 'Approvers review drafts. Authors create them.');
  const now = ctx.now().toISOString();
  const review: Review = {
    id: ctx.id('rev'), workspaceId: actor.workspaceId, title: input.title.trim(), channel: input.channel, text: input.text,
    contentHash: contentHash(input.text), wordCount: wc(input.text), status: 'draft',
    createdBy: actor.id, createdByName: actor.name, createdAt: now, updatedAt: now, version: 1, findings: [], decisions: [],
  };
  await ctx.repo.insertReview(review);
  await audit(ctx, actor, 'review.created', review.id, { title: review.title, channel: review.channel, contentHash: review.contentHash });
  return review;
}

export async function updateDraft(ctx: Ctx, actor: Actor, id: string, patch: { title?: string; text?: string }): Promise<Review> {
  const review = await load(ctx, actor, id);
  const next = check(review, 'edit', actor);
  const text = patch.text ?? review.text;
  const hash = contentHash(text);
  const textChanged = hash !== review.contentHash;
  const title = patch.title?.trim() ?? review.title;
  if (!textChanged && title === review.title) return review;

  const updated: Review = {
    ...review, title, text, contentHash: hash, wordCount: wc(text), updatedAt: ctx.now().toISOString(),
    ...(textChanged ? { status: next, submittedAt: undefined, submittedBy: undefined, submittedByName: undefined } : {}),
  };
  await ctx.repo.updateReview(updated, review.version);
  if (textChanged) {
    await audit(ctx, actor, 'review.edited', id, {
      fromHash: review.contentHash, toHash: hash, statusFrom: review.status, statusTo: next,
      approvalInvalidated: review.status === 'approved',
    });
  }
  if (title !== review.title) await audit(ctx, actor, 'review.renamed', id, { from: review.title, to: title });
  return { ...updated, version: review.version + 1 };
}

export async function analyzeReview(ctx: Ctx, actor: Actor, id: string): Promise<Review> {
  const review = await load(ctx, actor, id);
  check(review, 'analyze', actor);

  const [allRules, facts] = await Promise.all([ctx.repo.listRules(actor.workspaceId), ctx.repo.listFacts(actor.workspaceId)]);
  const rules = allRules.filter((r) => r.enabled);
  const started = ctx.now().getTime();
  const nextId = idGen();
  const ruleFindings = runRules(review.text, rules, facts, nextId);
  let ai: AIOutcome = { findings: [], proposed: 0, rejected: 0, reasons: [] };
  let aiError: string | undefined;
  try {
    ai = await runAI(ctx.llm, review.text, rules, facts, nextId);
  } catch (e) {
    aiError = e instanceof Error ? e.message : 'AI analysis failed.';
  }
  const findings = mergeFindings(ruleFindings, ai.findings);
  const prior = new Map(review.findings.map((f) => [f.id, f.decision]));
  for (const f of findings) {
    const d = prior.get(f.id);
    if (d) f.decision = d;
  }
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
  const now = ctx.now();
  const analysis: Analysis = {
    contentHash: review.contentHash, rulesetHash: hashRuleset(rules), at: now.toISOString(),
    provider: ctx.llm.name, model: ctx.llm.model, durationMs: now.getTime() - started,
    stats: { rule: ruleFindings.length, aiProposed: ai.proposed, aiVerified: ai.findings.length, aiRejected: ai.rejected },
    ...(aiError ? { aiError } : {}),
  };
  const updated: Review = {
    ...review, findings, analysis, status: 'analyzed', updatedAt: now.toISOString(),
    firstPass: review.firstPass ?? { total: findings.length, critical: count('critical'), major: count('major'), minor: count('minor') },
  };
  await ctx.repo.updateReview(updated, review.version);
  await audit(ctx, actor, 'review.analyzed', id, {
    contentHash: analysis.contentHash, rulesetHash: analysis.rulesetHash, provider: analysis.provider, model: analysis.model,
    ruleFindings: ruleFindings.length, aiVerified: ai.findings.length, aiRejected: ai.rejected,
    critical: count('critical'), major: count('major'), minor: count('minor'), aiError,
  });
  return { ...updated, version: review.version + 1 };
}

export async function decideFinding(
  ctx: Ctx, actor: Actor, id: string, findingId: string, input: { action: 'dismiss' | 'reopen'; reason?: string },
): Promise<Review> {
  const review = await load(ctx, actor, id);
  const f = review.findings.find((x) => x.id === findingId);
  if (!f) throw new AppError(404, 'not_found', 'Finding not found.');
  if (!['draft', 'analyzed', 'in_review'].includes(review.status)) {
    throw new AppError(409, 'locked', 'Findings are locked after a final decision. Edit the text to reopen the review.');
  }
  if (!analysisCurrent(review)) throw new AppError(409, 'stale_analysis', 'The analysis does not match the current text. Run the analysis again.');

  const authorSide = (actor.role === 'author' || actor.role === 'admin') && (review.createdBy === actor.id || actor.role === 'admin')
    && (review.status === 'draft' || review.status === 'analyzed');
  const reviewerSide = (actor.role === 'approver' || actor.role === 'admin') && review.status === 'in_review';
  const critical = f.severity === 'critical';
  if (critical ? !reviewerSide : !(authorSide || reviewerSide)) {
    throw new AppError(403, 'forbidden', critical
      ? 'Only an approver can override a critical finding, and only while the review is awaiting approval.'
      : 'You cannot change findings on this review right now.');
  }
  if (critical && review.submittedBy === actor.id) {
    throw new AppError(403, 'self_approval', 'You submitted this draft, so someone else has to override its critical findings.');
  }

  const now = ctx.now().toISOString();
  let findings = review.findings;
  if (input.action === 'dismiss') {
    const reason = (input.reason ?? '').trim();
    if (reason.length < 8) throw new AppError(422, 'reason_required', 'Give a reason of at least 8 characters. It goes in the audit trail.');
    if (f.decision) throw new AppError(409, 'already_dismissed', 'This finding is already dismissed.');
    findings = findings.map((x) => x.id === findingId
      ? { ...x, decision: { status: 'dismissed' as const, by: actor.id, byName: actor.name, byRole: actor.role, at: now, reason, override: critical } }
      : x);
  } else {
    if (!f.decision) throw new AppError(409, 'not_dismissed', 'This finding is already open.');
    findings = findings.map((x) => (x.id === findingId ? { ...x, decision: undefined } : x));
  }
  const updated: Review = { ...review, findings, updatedAt: now };
  await ctx.repo.updateReview(updated, review.version);
  await audit(ctx, actor, input.action === 'dismiss' ? 'finding.dismissed' : 'finding.reopened', id, {
    findingId, ruleId: f.ruleId, ruleTitle: f.ruleTitle, severity: f.severity, quote: f.span?.quote, origin: f.origin,
    reason: input.action === 'dismiss' ? (input.reason ?? '').trim() : undefined, override: critical,
  });
  return { ...updated, version: review.version + 1 };
}

const TRANSITION_EVENT = {
  submit: 'review.submitted', approve: 'review.approved', request_changes: 'review.changes_requested', reject: 'review.rejected',
} as const;
const DECISION_ACTION = { approve: 'approved', request_changes: 'changes_requested', reject: 'rejected' } as const;

export async function transitionReview(
  ctx: Ctx, actor: Actor, id: string, action: 'submit' | 'approve' | 'request_changes' | 'reject', rationale?: string,
): Promise<Review> {
  const review = await load(ctx, actor, id);
  const next = check(review, action, actor, rationale);
  const now = ctx.now().toISOString();
  const overrides = review.findings
    .filter((f) => f.severity === 'critical' && f.decision?.override)
    .map((f) => ({ findingId: f.id, ruleTitle: f.ruleTitle, reason: f.decision!.reason }));
  if (action === 'approve' && overrides.length > 0 && (rationale ?? '').trim().length < 8) {
    throw new AppError(422, 'rationale_required', 'You overrode critical findings. Add a rationale of at least 8 characters.');
  }

  let updated: Review = { ...review, status: next, updatedAt: now };
  if (action === 'submit') {
    updated = { ...updated, submittedAt: now, submittedBy: actor.id, submittedByName: actor.name };
  } else {
    const decision: ReviewDecision = {
      id: ctx.id('dec'), action: DECISION_ACTION[action as keyof typeof DECISION_ACTION],
      by: actor.id, byName: actor.name, byRole: actor.role, at: now, rationale: (rationale ?? '').trim(),
      contentHash: review.contentHash, rulesetHash: review.analysis?.rulesetHash ?? '', overrides,
      waitMs: review.submittedAt ? Math.max(0, Date.parse(now) - Date.parse(review.submittedAt)) : 0,
    };
    updated = { ...updated, decisions: [...review.decisions, decision] };
  }
  await ctx.repo.updateReview(updated, review.version);
  await audit(ctx, actor, TRANSITION_EVENT[action], id, {
    from: review.status, to: next, contentHash: review.contentHash, rulesetHash: review.analysis?.rulesetHash,
    rationale: (rationale ?? '').trim() || undefined, overrides: overrides.map((o) => o.findingId),
    openFindings: review.findings.filter((f) => !f.decision).length,
  });
  return { ...updated, version: review.version + 1 };
}

export async function listReviews(ctx: Ctx, actor: Actor): Promise<Review[]> {
  return ctx.repo.listReviews(actor.workspaceId);
}

export type Can = Record<'analyze' | 'edit' | 'submit' | 'approve' | 'request_changes' | 'reject', { ok: boolean; reason?: string }>;

export async function reviewView(ctx: Ctx, actor: Actor, id: string) {
  const review = await load(ctx, actor, id);
  const [events, chainEvents, rules] = await Promise.all([
    ctx.repo.listAudit(actor.workspaceId, { reviewId: id }), ctx.repo.allAudit(actor.workspaceId), ctx.repo.listRules(actor.workspaceId),
  ]);
  const can = {} as Can;
  for (const a of ['analyze', 'edit', 'submit', 'approve', 'request_changes', 'reject'] as const) {
    const g = guard(review, a, { actor, openCritical: openCritical(review), analysisCurrent: analysisCurrent(review), rationale: 'placeholder rationale' });
    can[a] = g.ok ? { ok: true } : { ok: false, reason: g.message };
  }
  const current = analysisCurrent(review) && ['draft', 'analyzed', 'in_review'].includes(review.status);
  const authorSide = (actor.role === 'author' || actor.role === 'admin') && (review.createdBy === actor.id || actor.role === 'admin')
    && (review.status === 'draft' || review.status === 'analyzed');
  const reviewerSide = (actor.role === 'approver' || actor.role === 'admin') && review.status === 'in_review';
  const canDismiss = { other: current && (authorSide || reviewerSide), critical: current && reviewerSide && review.submittedBy !== actor.id };
  return {
    review, audit: events, chain: verifyChain(chainEvents), can, canDismiss,
    approvalValid: isApprovalValid(review),
    rulesetCurrent: !review.analysis || review.analysis.rulesetHash === hashRuleset(rules),
  };
}

/* ---------- brand workspace ---------- */

export async function getBrand(ctx: Ctx, actor: Actor): Promise<{ workspace: Workspace; rules: Rule[]; facts: Fact[]; rulesetHash: string }> {
  const [workspace, rules, facts] = await Promise.all([
    ctx.repo.getWorkspace(actor.workspaceId), ctx.repo.listRules(actor.workspaceId), ctx.repo.listFacts(actor.workspaceId),
  ]);
  if (!workspace) throw new AppError(404, 'not_found', 'Workspace not found.');
  return { workspace, rules: rules.sort((a, b) => a.title.localeCompare(b.title)), facts, rulesetHash: hashRuleset(rules) };
}

export async function createTermRule(
  ctx: Ctx, actor: Actor,
  input: { title: string; terms: string[]; preferred?: string; severity: Severity; sourceDoc: string; sourceQuote: string },
): Promise<Rule> {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden_role', 'Only an admin can change the brand rules.');
  const rule: Rule = {
    id: ctx.id('rule'), workspaceId: actor.workspaceId, type: 'banned_term', title: input.title,
    description: 'Custom terminology rule added by an admin.', severity: input.severity,
    source: { doc: input.sourceDoc, quote: input.sourceQuote }, enabled: true, version: 1, tags: ['custom'],
    updatedAt: ctx.now().toISOString(),
    config: { terms: input.terms, ...(input.preferred ? { preferred: input.preferred } : {}) },
  };
  await ctx.repo.saveRule(rule);
  await audit(ctx, actor, 'rule.created', undefined, { ruleId: rule.id, title: rule.title, terms: input.terms, severity: rule.severity });
  return rule;
}

export async function setRuleEnabled(ctx: Ctx, actor: Actor, ruleId: string, enabled: boolean): Promise<Rule> {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden_role', 'Only an admin can change the brand rules.');
  const rule = await ctx.repo.getRule(ruleId);
  if (!rule || rule.workspaceId !== actor.workspaceId) throw new AppError(404, 'not_found', 'Rule not found.');
  if (rule.enabled === enabled) return rule;
  const updated = { ...rule, enabled, version: rule.version + 1, updatedAt: ctx.now().toISOString() } as Rule;
  await ctx.repo.saveRule(updated);
  await audit(ctx, actor, enabled ? 'rule.enabled' : 'rule.disabled', undefined, { ruleId, title: rule.title, version: updated.version });
  return updated;
}

/* ---------- insights & integrity ---------- */

export async function getInsights(ctx: Ctx, actor: Actor) {
  return computeInsights(await ctx.repo.listReviews(actor.workspaceId));
}

export async function verifyWorkspaceChain(ctx: Ctx, actor: Actor) {
  return verifyChain(await ctx.repo.allAudit(actor.workspaceId));
}
