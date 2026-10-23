import type { Review, ReviewStatus, Severity } from '../types';

export interface Insights {
  totals: { reviews: number; byStatus: Record<ReviewStatus, number> };
  quality: { firstPassCleanRate: number | null; issuesRemovedRate: number | null; findingsPerReview: number | null; findingsPer100Words: number | null };
  severity: Record<Severity, number>;
  hotRules: { ruleId: string; title: string; severity: Severity; count: number }[];
  decisions: {
    total: number; approved: number; changesRequested: number; rejected: number;
    approvalRate: number | null; medianWaitMs: number | null; meanWaitMs: number | null;
    criticalFindings: number; overrides: number; overrideRate: number | null; hashBoundRate: number | null;
  };
  ai: { proposed: number; verified: number; rejected: number; verifiedRate: number | null; keptRate: number | null };
  evidence: { findings: number; withEvidence: number; coverage: number | null };
  trend: { reviewId: string; title: string; first: number; now: number }[];
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function computeInsights(reviews: Review[]): Insights {
  const byStatus: Record<ReviewStatus, number> = { draft: 0, analyzed: 0, in_review: 0, changes_requested: 0, approved: 0, rejected: 0 };
  reviews.forEach((r) => { byStatus[r.status] += 1; });

  const withFirst = reviews.filter((r) => r.firstPass);
  const clean = withFirst.filter((r) => r.firstPass!.critical + r.firstPass!.major === 0).length;
  const approved = withFirst.filter((r) => r.status === 'approved');
  const firstTotal = sum(approved.map((r) => r.firstPass!.total));
  const nowTotal = sum(approved.map((r) => r.findings.length));
  const allFindings = reviews.flatMap((r) => r.findings);
  const words = sum(withFirst.map((r) => r.wordCount));

  const severity: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  const byRule = new Map<string, { ruleId: string; title: string; severity: Severity; count: number }>();
  for (const f of allFindings) {
    severity[f.severity] += 1;
    const e = byRule.get(f.ruleId) ?? { ruleId: f.ruleId, title: f.ruleTitle, severity: f.severity, count: 0 };
    e.count += 1;
    byRule.set(f.ruleId, e);
  }

  const decisions = reviews.flatMap((r) => r.decisions);
  const waits = decisions.map((d) => d.waitMs).filter((w) => w > 0);
  const crit = allFindings.filter((f) => f.severity === 'critical');
  const overrides = crit.filter((f) => f.decision?.override).length;
  const hashBound = decisions.filter((d) => d.contentHash && d.rulesetHash && d.byName).length;

  const analyses = reviews.filter((r) => r.analysis);
  const proposed = sum(analyses.map((r) => r.analysis!.stats.aiProposed));
  const verified = sum(analyses.map((r) => r.analysis!.stats.aiVerified));
  const aiFindings = allFindings.filter((f) => f.origin === 'ai');
  const withEvidence = allFindings.filter((f) => f.span && f.evidence.ruleSource.quote).length;

  return {
    totals: { reviews: reviews.length, byStatus },
    quality: {
      firstPassCleanRate: ratio(clean, withFirst.length),
      issuesRemovedRate: firstTotal > 0 ? Math.max(0, 1 - nowTotal / firstTotal) : null,
      findingsPerReview: ratio(allFindings.length, reviews.length),
      findingsPer100Words: words > 0 ? (sum(withFirst.map((r) => r.firstPass!.total)) / words) * 100 : null,
    },
    severity,
    hotRules: [...byRule.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 5),
    decisions: {
      total: decisions.length,
      approved: decisions.filter((d) => d.action === 'approved').length,
      changesRequested: decisions.filter((d) => d.action === 'changes_requested').length,
      rejected: decisions.filter((d) => d.action === 'rejected').length,
      approvalRate: ratio(decisions.filter((d) => d.action === 'approved').length, decisions.length),
      medianWaitMs: median(waits),
      meanWaitMs: waits.length ? sum(waits) / waits.length : null,
      criticalFindings: crit.length, overrides, overrideRate: ratio(overrides, crit.length),
      hashBoundRate: ratio(hashBound, decisions.length),
    },
    ai: { proposed, verified, rejected: proposed - verified, verifiedRate: ratio(verified, proposed), keptRate: ratio(aiFindings.filter((f) => !f.decision).length, aiFindings.length) },
    evidence: { findings: allFindings.length, withEvidence, coverage: ratio(withEvidence, allFindings.length) },
    trend: [...withFirst]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => ({ reviewId: r.id, title: r.title, first: r.firstPass!.total, now: r.findings.length })),
  };
}
