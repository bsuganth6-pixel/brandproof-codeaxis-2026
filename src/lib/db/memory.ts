import { AppError, DuplicateSeqError } from '../errors';
import type { AuditEvent, Fact, Review, Role, Rule, User, Workspace } from '../types';
import type { Repo, Snapshot } from './repo';

const clone = <T>(v: T): T => structuredClone(v);
const conflict = () => new AppError(409, 'conflict', 'This review changed while you were working. Reload and try again.');

export class MemoryRepo implements Repo {
  mode = 'memory' as const;
  private workspaces = new Map<string, Workspace>();
  private users = new Map<string, User>();
  private rules = new Map<string, Rule>();
  private facts = new Map<string, Fact>();
  private reviews = new Map<string, Review>();
  private audit: AuditEvent[] = [];

  async getWorkspace(id: string) { return clone(this.workspaces.get(id) ?? null); }
  async getUser(id: string) { return clone(this.users.get(id) ?? null); }
  async getUserByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return clone([...this.users.values()].find((u) => u.email.toLowerCase() === e) ?? null);
  }
  async getUserByRole(workspaceId: string, role: Role) {
    return clone([...this.users.values()].find((u) => u.workspaceId === workspaceId && u.role === role) ?? null);
  }
  async listRules(workspaceId: string) { return clone([...this.rules.values()].filter((r) => r.workspaceId === workspaceId)); }
  async getRule(id: string) { return clone(this.rules.get(id) ?? null); }
  async saveRule(rule: Rule) { this.rules.set(rule.id, clone(rule)); }
  async listFacts(workspaceId: string) { return clone([...this.facts.values()].filter((f) => f.workspaceId === workspaceId)); }
  async listReviews(workspaceId: string) {
    return clone([...this.reviews.values()].filter((r) => r.workspaceId === workspaceId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  async getReview(id: string) { return clone(this.reviews.get(id) ?? null); }
  async insertReview(r: Review) {
    if (this.reviews.has(r.id)) throw conflict();
    this.reviews.set(r.id, clone(r));
  }
  async updateReview(r: Review, expectedVersion: number) {
    const cur = this.reviews.get(r.id);
    if (!cur || cur.version !== expectedVersion) throw conflict();
    this.reviews.set(r.id, clone({ ...r, version: expectedVersion + 1 }));
  }
  async lastAudit(workspaceId: string) {
    const mine = this.audit.filter((e) => e.workspaceId === workspaceId);
    return clone(mine[mine.length - 1] ?? null);
  }
  async appendAudit(e: AuditEvent) {
    if (this.audit.some((x) => x.workspaceId === e.workspaceId && x.seq === e.seq)) throw new DuplicateSeqError();
    this.audit.push(clone(e));
  }
  async listAudit(workspaceId: string, opts: { reviewId?: string; limit?: number } = {}) {
    let rows = this.audit.filter((e) => e.workspaceId === workspaceId && (!opts.reviewId || e.reviewId === opts.reviewId));
    rows = [...rows].sort((a, b) => a.seq - b.seq);
    if (opts.limit) rows = rows.slice(-opts.limit);
    return clone(rows);
  }
  async allAudit(workspaceId: string) { return this.listAudit(workspaceId); }
  async importAll(s: Snapshot) {
    for (const w of s.workspaces) if (!this.workspaces.has(w.id)) this.workspaces.set(w.id, clone(w));
    for (const u of s.users) if (!this.users.has(u.id)) this.users.set(u.id, clone(u));
    for (const r of s.rules) if (!this.rules.has(r.id)) this.rules.set(r.id, clone(r));
    for (const f of s.facts) if (!this.facts.has(f.id)) this.facts.set(f.id, clone(f));
    for (const r of s.reviews) if (!this.reviews.has(r.id)) this.reviews.set(r.id, clone(r));
    for (const e of s.audit) if (!this.audit.some((x) => x.workspaceId === e.workspaceId && x.seq === e.seq)) this.audit.push(clone(e));
  }
  async ping() { return true; }

  snapshot(): Snapshot {
    return clone({
      workspaces: [...this.workspaces.values()], users: [...this.users.values()], rules: [...this.rules.values()],
      facts: [...this.facts.values()], reviews: [...this.reviews.values()], audit: this.audit,
    });
  }
}
