export type Role = 'admin' | 'author' | 'approver';
export type Severity = 'critical' | 'major' | 'minor';
export type Channel = 'social' | 'email' | 'web' | 'ad' | 'press';
export type ReviewStatus = 'draft' | 'analyzed' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
export type RuleType = 'banned_term' | 'restricted_claim' | 'required_phrase' | 'fact_check' | 'style_limit' | 'ai_guideline';

export interface Source { doc: string; quote: string }
export interface Workspace { id: string; name: string; guideName: string; createdAt: string }
export interface User { id: string; workspaceId: string; email: string; name: string; role: Role; passwordHash: string }
export interface Fact { id: string; workspaceId: string; statement: string; source: Source }

interface RuleBase {
  id: string; workspaceId: string; title: string; description: string; severity: Severity;
  source: Source; enabled: boolean; version: number; tags: string[]; updatedAt: string;
}
export type Rule = RuleBase & (
  | { type: 'banned_term'; config: { terms: string[]; preferred?: string; caseSensitive?: boolean } }
  | { type: 'restricted_claim'; config: { terms: string[] } }
  | { type: 'required_phrase'; config: { triggerPatterns: string[]; requiredPatterns: string[]; insert: string } }
  | { type: 'fact_check'; config: { factId: string; pattern: string; expected: string[] } }
  | { type: 'style_limit'; config: { kind: 'max_exclamations' | 'no_all_caps' | 'max_sentence_words'; limit?: number; allow?: string[] } }
  | { type: 'ai_guideline'; config: { guidance: string } }
);

export interface FindingDecision {
  status: 'dismissed'; by: string; byName: string; byRole: Role; at: string; reason: string; override: boolean;
}
export interface Finding {
  id: string; ruleId: string; ruleTitle: string; type: RuleType; severity: Severity;
  origin: 'rule' | 'ai';
  message: string; suggestion?: string; replacement?: string; append?: string;
  span: { start: number; end: number; quote: string } | null;
  evidence: { ruleSource: Source; fact?: { id: string; statement: string; source: Source } };
  confidence?: number;
  decision?: FindingDecision;
}

export interface Analysis {
  contentHash: string; rulesetHash: string; at: string; provider: string; model: string; durationMs: number;
  stats: { rule: number; aiProposed: number; aiVerified: number; aiRejected: number };
  aiError?: string;
}
export interface ReviewDecision {
  id: string; action: 'approved' | 'changes_requested' | 'rejected';
  by: string; byName: string; byRole: Role; at: string; rationale: string;
  contentHash: string; rulesetHash: string;
  overrides: { findingId: string; ruleTitle: string; reason: string }[];
  waitMs: number;
}
export interface Review {
  id: string; workspaceId: string; title: string; channel: Channel; text: string;
  contentHash: string; wordCount: number; status: ReviewStatus;
  createdBy: string; createdByName: string; createdAt: string; updatedAt: string; version: number;
  analysis?: Analysis;
  firstPass?: { total: number; critical: number; major: number; minor: number };
  findings: Finding[];
  submittedAt?: string; submittedBy?: string; submittedByName?: string;
  decisions: ReviewDecision[];
}

export interface AuditEvent {
  id: string; workspaceId: string; seq: number; at: string;
  actorId: string; actorName: string; actorRole: Role;
  action: string; reviewId?: string; detail: Record<string, unknown>;
  prevHash: string; hash: string;
}
export interface ChainStatus { ok: boolean; count: number; brokenAt?: number }

export interface Session { id: string; name: string; role: Role; workspaceId: string }
