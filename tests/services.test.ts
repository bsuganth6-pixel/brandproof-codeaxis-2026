import { describe, expect, it } from 'vitest';
import { computeInsights } from '@/lib/core/metrics';
import { isApprovalValid } from '@/lib/core/statemachine';
import { MemoryRepo } from '@/lib/db/memory';
import { MockProvider } from '@/lib/llm/mock';
import type { LLMProvider } from '@/lib/llm/types';
import { buildSeed, SEED_TEXTS } from '@/lib/seed';
import {
  analyzeReview, createReview, decideFinding, reviewView, setRuleEnabled, transitionReview, updateDraft, verifyWorkspaceChain,
  type Actor, type Ctx,
} from '@/lib/services';

async function setup(llm: LLMProvider = new MockProvider()) {
  const repo = new MemoryRepo();
  await repo.importAll(await buildSeed());
  let n = 0;
  let t = Date.UTC(2026, 9, 25, 5, 0);
  const ctx: Ctx = { repo, llm, now: () => new Date((t += 1000)), id: (p) => `${p}_t${++n}` };
  const actor = async (id: string): Promise<Actor> => {
    const u = (await repo.getUser(id))!;
    return { id: u.id, name: u.name, role: u.role, workspaceId: u.workspaceId };
  };
  return { ctx, repo, author: await actor('usr_author'), approver: await actor('usr_approver'), admin: await actor('usr_admin') };
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? 'error');
const CLEAN = 'Fresh single-origin coffee, roasted slowly in Coimbatore.';

describe('review workflow', () => {
  it('runs draft → analysis → submission → approval and leaves a valid audit chain', async () => {
    const { ctx, author, approver } = await setup();
    let r = await createReview(ctx, author, { title: 'Clean post', channel: 'social', text: CLEAN });
    r = await analyzeReview(ctx, author, r.id);
    expect(r.status).toBe('analyzed');
    expect(r.analysis?.contentHash).toBe(r.contentHash);
    r = await transitionReview(ctx, author, r.id, 'submit');
    r = await transitionReview(ctx, approver, r.id, 'approve', 'Looks good.');
    expect(r.status).toBe('approved');
    expect(isApprovalValid(r)).toBe(true);
    expect(r.decisions[0]).toMatchObject({ by: approver.id, contentHash: r.contentHash, rulesetHash: r.analysis?.rulesetHash });
    expect(await verifyWorkspaceChain(ctx, approver)).toMatchObject({ ok: true });
  });

  it('forbids self-approval and wrong-role actions', async () => {
    const { ctx, author, admin, approver } = await setup();
    let r = await createReview(ctx, author, { title: 'Draft', channel: 'social', text: CLEAN });
    expect(await code(createReview(ctx, approver, { title: 'Nope', channel: 'social', text: CLEAN }))).toBe('forbidden_role');
    r = await analyzeReview(ctx, author, r.id);
    r = await transitionReview(ctx, admin, r.id, 'submit'); // admin may submit on the author's behalf
    expect(await code(transitionReview(ctx, admin, r.id, 'approve', 'self'))).toBe('self_approval');
    expect(await code(transitionReview(ctx, author, r.id, 'approve'))).toBe('forbidden_role');
  });

  it('blocks submission when the text changed after the analysis', async () => {
    const { ctx, author } = await setup();
    let r = await createReview(ctx, author, { title: 'Draft', channel: 'social', text: CLEAN });
    r = await analyzeReview(ctx, author, r.id);
    r = await updateDraft(ctx, author, r.id, { text: `${CLEAN} Come say hello.` });
    expect(r.status).toBe('draft');
    expect(await code(transitionReview(ctx, author, r.id, 'submit'))).toBe('invalid_transition');
  });

  it('makes critical findings an approver decision with a recorded reason and rationale', async () => {
    const { ctx, author, approver } = await setup();
    let r = await createReview(ctx, author, { title: 'Risky', channel: 'social', text: 'Our cold brew cures tiredness.' });
    r = await analyzeReview(ctx, author, r.id);
    const crit = r.findings.find((f) => f.severity === 'critical')!;
    expect(await code(decideFinding(ctx, author, r.id, crit.id, { action: 'dismiss', reason: 'It is fine really' }))).toBe('forbidden');
    r = await transitionReview(ctx, author, r.id, 'submit');
    expect(await code(transitionReview(ctx, approver, r.id, 'approve', 'ok ok ok ok'))).toBe('open_critical');
    expect(await code(decideFinding(ctx, approver, r.id, crit.id, { action: 'dismiss', reason: 'short' }))).toBe('reason_required');
    r = await decideFinding(ctx, approver, r.id, crit.id, { action: 'dismiss', reason: 'Medical wording was approved by legal on 20 Oct.' });
    expect(r.findings.find((f) => f.id === crit.id)?.decision).toMatchObject({ override: true, byRole: 'approver' });
    expect(await code(transitionReview(ctx, approver, r.id, 'approve'))).toBe('rationale_required');
    r = await transitionReview(ctx, approver, r.id, 'approve', 'Legal sign-off recorded in the ticket.');
    expect(r.decisions[0].overrides).toHaveLength(1);
    const events = await ctx.repo.listAudit(author.workspaceId, { reviewId: r.id });
    expect(events.some((e) => e.action === 'finding.dismissed' && e.detail.override === true)).toBe(true);
  });

  it('invalidates an approval as soon as the text changes', async () => {
    const { ctx, author, approver } = await setup();
    let r = await createReview(ctx, author, { title: 'Draft', channel: 'social', text: CLEAN });
    r = await analyzeReview(ctx, author, r.id);
    r = await transitionReview(ctx, author, r.id, 'submit');
    r = await transitionReview(ctx, approver, r.id, 'approve', 'Approved as written.');
    const approvedHash = r.contentHash;
    r = await updateDraft(ctx, author, r.id, { text: `${CLEAN} Now with a surprise.` });
    expect(r.status).toBe('draft');
    expect(r.contentHash).not.toBe(approvedHash);
    expect(isApprovalValid(r)).toBe(false);
    expect(r.submittedBy).toBeUndefined();
    const events = await ctx.repo.listAudit(author.workspaceId, { reviewId: r.id });
    expect(events.find((e) => e.action === 'review.edited' && e.detail.approvalInvalidated === true)).toBeTruthy();
  });

  it('keeps the audit trail free of draft text', async () => {
    const { ctx, author } = await setup();
    const r = await createReview(ctx, author, { title: 'Secret launch', channel: 'press', text: 'Embargoed: the secret roast is called Ember.' });
    await analyzeReview(ctx, author, r.id);
    const blob = JSON.stringify(await ctx.repo.listAudit(author.workspaceId, { reviewId: r.id }));
    expect(blob).not.toContain('Embargoed');
  });

  it('rejects a concurrent edit instead of overwriting it', async () => {
    const { ctx, author } = await setup();
    const r = await createReview(ctx, author, { title: 'Draft', channel: 'social', text: CLEAN });
    const res = await Promise.allSettled([
      updateDraft(ctx, author, r.id, { text: 'First version of the copy.' }),
      updateDraft(ctx, author, r.id, { text: 'Second version of the copy.' }),
    ]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const failed = res.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.code).toBe('conflict');
  });
});

describe('model failures never block the rule engine', () => {
  it('records the error and still returns rule findings when the provider throws', async () => {
    const { ctx, author } = await setup({ name: 'broken', model: 'x', analyze: async () => { throw new Error('The model API timed out.'); } });
    const r = await analyzeReview(ctx, author, (await createReview(ctx, author, { title: 'T', channel: 'social', text: 'So CHEAP!' })).id);
    expect(r.analysis?.aiError).toMatch(/timed out/);
    expect(r.findings.some((f) => f.ruleId === 'rule_no_cheap')).toBe(true);
    expect(r.status).toBe('analyzed');
  });

  it('counts hallucinated findings as rejected and never shows them', async () => {
    const liar: LLMProvider = {
      name: 'liar', model: 'x',
      analyze: async () => [
        { ruleId: 'rule_tone_pressure', quote: 'buy it before midnight', explanation: 'invented quote' },
        { ruleId: 'rule_tone_pressure', quote: 'Hurry', explanation: 'real' },
      ],
    };
    const { ctx, author } = await setup(liar);
    const r = await analyzeReview(ctx, author, (await createReview(ctx, author, { title: 'T', channel: 'social', text: 'Hurry in this weekend.' })).id);
    expect(r.analysis?.stats).toMatchObject({ aiProposed: 2, aiVerified: 1, aiRejected: 1 });
    expect(r.findings.filter((f) => f.origin === 'ai')).toHaveLength(1);
  });
});

describe('brand rules', () => {
  it('lets only admins change rules, and changes the ruleset identity', async () => {
    const { ctx, author, admin } = await setup();
    let r = await createReview(ctx, author, { title: 'T', channel: 'social', text: 'So cheap.' });
    r = await analyzeReview(ctx, author, r.id);
    expect(r.findings.some((f) => f.ruleId === 'rule_no_cheap')).toBe(true);
    expect(await code(setRuleEnabled(ctx, author, 'rule_no_cheap', false))).toBe('forbidden_role');
    await setRuleEnabled(ctx, admin, 'rule_no_cheap', false);
    expect((await reviewView(ctx, author, r.id)).rulesetCurrent).toBe(false);
    r = await analyzeReview(ctx, author, r.id);
    expect(r.findings.some((f) => f.ruleId === 'rule_no_cheap')).toBe(false);
    expect((await reviewView(ctx, author, r.id)).rulesetCurrent).toBe(true);
  });
});

describe('seed data and insights', () => {
  it('seeds seven reviews across every status with an intact audit chain', async () => {
    const { ctx, admin } = await setup();
    const reviews = await ctx.repo.listReviews(admin.workspaceId);
    const status = Object.fromEntries(reviews.map((r) => [r.title, r.status]));
    expect(reviews).toHaveLength(7);
    expect(status['Fairtrade anniversary post']).toBe('approved');
    expect(status['Diwali gift box launch']).toBe('approved');
    expect(status['Monsoon cold brew offer']).toBe('changes_requested');
    expect(status['Chennai café opening press note']).toBe('rejected');
    expect(status['Founders story blog intro']).toBe('in_review');
    expect(status['Weekend flash sale post']).toBe('analyzed');
    expect(await verifyWorkspaceChain(ctx, admin)).toMatchObject({ ok: true });
  });

  it('computes numeric governance metrics from stored reviews', async () => {
    const { ctx, admin } = await setup();
    const i = computeInsights(await ctx.repo.listReviews(admin.workspaceId));
    expect(i.totals.reviews).toBe(7);
    expect(i.decisions).toMatchObject({ total: 5, approved: 3, changesRequested: 1, rejected: 1, approvalRate: 0.6, overrides: 1, criticalFindings: 5, overrideRate: 0.2 });
    expect(i.decisions.medianWaitMs).toBe(95 * 60000);
    expect(i.quality.firstPassCleanRate).toBeCloseTo(2 / 7, 5);
    expect(i.quality.issuesRemovedRate).toBeCloseTo(2 / 3, 5); // a dismissed finding is not a removed finding
    expect(i.evidence.coverage).toBe(1);
    expect(i.decisions.hashBoundRate).toBe(1);
    expect(i.hotRules.length).toBeGreaterThan(0);
    expect(i.severity.critical).toBeGreaterThan(0);
  });

  it('the flash-sale demo draft trips every rule family', async () => {
    const { ctx, admin } = await setup();
    const r = (await ctx.repo.listReviews(admin.workspaceId)).find((x) => x.text === SEED_TEXTS.flash)!;
    const types = new Set(r.findings.map((f) => f.type));
    for (const t of ['banned_term', 'restricted_claim', 'required_phrase', 'fact_check', 'style_limit', 'ai_guideline']) expect(types.has(t as never)).toBe(true);
    expect(r.findings.filter((f) => f.severity === 'critical').length).toBeGreaterThanOrEqual(4);
  });
});
