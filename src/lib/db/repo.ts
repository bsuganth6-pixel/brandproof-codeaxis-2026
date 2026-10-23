import type { AuditEvent, Fact, Review, Role, Rule, User, Workspace } from '../types';

export interface Snapshot {
  workspaces: Workspace[]; users: User[]; rules: Rule[]; facts: Fact[]; reviews: Review[]; audit: AuditEvent[];
}

export interface Repo {
  mode: 'memory' | 'mongodb';
  getWorkspace(id: string): Promise<Workspace | null>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByRole(workspaceId: string, role: Role): Promise<User | null>;
  listRules(workspaceId: string): Promise<Rule[]>;
  getRule(id: string): Promise<Rule | null>;
  saveRule(rule: Rule): Promise<void>;
  listFacts(workspaceId: string): Promise<Fact[]>;
  listReviews(workspaceId: string): Promise<Review[]>;
  getReview(id: string): Promise<Review | null>;
  insertReview(r: Review): Promise<void>;
  /** Optimistic concurrency: writes only if the stored version equals expectedVersion, then bumps it. */
  updateReview(r: Review, expectedVersion: number): Promise<void>;
  lastAudit(workspaceId: string): Promise<AuditEvent | null>;
  /** Throws DuplicateSeqError when another writer already took this sequence number. */
  appendAudit(e: AuditEvent): Promise<void>;
  /** Ascending by seq. With `limit`, returns the most recent N (still ascending). */
  listAudit(workspaceId: string, opts?: { reviewId?: string; limit?: number }): Promise<AuditEvent[]>;
  allAudit(workspaceId: string): Promise<AuditEvent[]>;
  /** Idempotent bulk insert used by seeding: never overwrites existing documents. */
  importAll(s: Snapshot): Promise<void>;
  ping(): Promise<boolean>;
}
