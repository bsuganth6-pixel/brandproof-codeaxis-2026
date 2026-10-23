import { MongoClient, type Db, type Document } from 'mongodb';
import { AppError, DuplicateSeqError } from '../errors';
import type { AuditEvent, Fact, Review, Role, Rule, User, Workspace } from '../types';
import type { Repo, Snapshot } from './repo';

const g = globalThis as unknown as { __bpMongo?: Promise<MongoClient>; __bpIndexes?: Promise<void> };

const toDoc = <T extends { id: string }>(o: T): Document => ({ ...o, _id: o.id });
function fromDoc<T>(d: Document | null): T | null {
  if (!d) return null;
  const { _id, ...rest } = d;
  void _id;
  return rest as T;
}
const many = <T>(ds: Document[]) => ds.map((d) => fromDoc<T>(d) as T);
const dup = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;

export class MongoRepo implements Repo {
  mode = 'mongodb' as const;
  constructor(private uri: string, private dbName = process.env.MONGODB_DB || 'brandproof') {}

  private async db(): Promise<Db> {
    if (!g.__bpMongo) {
      g.__bpMongo = new MongoClient(this.uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000, ignoreUndefined: true }).connect();
      g.__bpMongo.catch(() => { g.__bpMongo = undefined; });
    }
    const db = (await g.__bpMongo).db(this.dbName);
    if (!g.__bpIndexes) {
      g.__bpIndexes = Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('users').createIndex({ workspaceId: 1, role: 1 }),
        db.collection('rules').createIndex({ workspaceId: 1 }),
        db.collection('facts').createIndex({ workspaceId: 1 }),
        db.collection('reviews').createIndex({ workspaceId: 1, updatedAt: -1 }),
        db.collection('audit_events').createIndex({ workspaceId: 1, seq: 1 }, { unique: true }),
        db.collection('audit_events').createIndex({ workspaceId: 1, reviewId: 1, seq: 1 }),
      ]).then(() => undefined);
      g.__bpIndexes.catch(() => { g.__bpIndexes = undefined; });
    }
    await g.__bpIndexes;
    return db;
  }

  private async col(name: string) { return (await this.db()).collection(name); }

  async getWorkspace(id: string) { return fromDoc<Workspace>(await (await this.col('workspaces')).findOne({ _id: id as never })); }
  async getUser(id: string) { return fromDoc<User>(await (await this.col('users')).findOne({ _id: id as never })); }
  async getUserByEmail(email: string) { return fromDoc<User>(await (await this.col('users')).findOne({ email: email.trim().toLowerCase() })); }
  async getUserByRole(workspaceId: string, role: Role) { return fromDoc<User>(await (await this.col('users')).findOne({ workspaceId, role })); }
  async listRules(workspaceId: string) { return many<Rule>(await (await this.col('rules')).find({ workspaceId }).toArray()); }
  async getRule(id: string) { return fromDoc<Rule>(await (await this.col('rules')).findOne({ _id: id as never })); }
  async saveRule(rule: Rule) { await (await this.col('rules')).replaceOne({ _id: rule.id as never }, toDoc(rule), { upsert: true }); }
  async listFacts(workspaceId: string) { return many<Fact>(await (await this.col('facts')).find({ workspaceId }).toArray()); }
  async listReviews(workspaceId: string) {
    return many<Review>(await (await this.col('reviews')).find({ workspaceId }).sort({ updatedAt: -1 }).toArray());
  }
  async getReview(id: string) { return fromDoc<Review>(await (await this.col('reviews')).findOne({ _id: id as never })); }
  async insertReview(r: Review) { await (await this.col('reviews')).insertOne(toDoc(r)); }
  async updateReview(r: Review, expectedVersion: number) {
    const res = await (await this.col('reviews')).replaceOne({ _id: r.id as never, version: expectedVersion }, toDoc({ ...r, version: expectedVersion + 1 }));
    if (res.matchedCount === 0) throw new AppError(409, 'conflict', 'This review changed while you were working. Reload and try again.');
  }
  async lastAudit(workspaceId: string) {
    const rows = await (await this.col('audit_events')).find({ workspaceId }).sort({ seq: -1 }).limit(1).toArray();
    return fromDoc<AuditEvent>(rows[0] ?? null);
  }
  async appendAudit(e: AuditEvent) {
    try { await (await this.col('audit_events')).insertOne(toDoc(e)); } catch (err) { if (dup(err)) throw new DuplicateSeqError(); throw err; }
  }
  async listAudit(workspaceId: string, opts: { reviewId?: string; limit?: number } = {}) {
    const filter: Document = { workspaceId };
    if (opts.reviewId) filter.reviewId = opts.reviewId;
    const c = (await this.col('audit_events')).find(filter);
    if (opts.limit) return many<AuditEvent>(await c.sort({ seq: -1 }).limit(opts.limit).toArray()).reverse();
    return many<AuditEvent>(await c.sort({ seq: 1 }).toArray());
  }
  async allAudit(workspaceId: string) { return this.listAudit(workspaceId); }

  async importAll(s: Snapshot) {
    const upsertAll = async (name: string, items: { id: string }[]) => {
      if (!items.length) return;
      const ops = items.map((o) => {
        const { _id, ...rest } = toDoc(o);
        return { updateOne: { filter: { _id }, update: { $setOnInsert: rest }, upsert: true } };
      });
      await (await this.col(name)).bulkWrite(ops, { ordered: false });
    };
    await upsertAll('users', s.users);
    await upsertAll('rules', s.rules);
    await upsertAll('facts', s.facts);
    await upsertAll('reviews', s.reviews);
    if (s.audit.length) {
      try { await (await this.col('audit_events')).insertMany(s.audit.map(toDoc), { ordered: false }); } catch (e) { if (!dup(e)) throw e; }
    }
    await upsertAll('workspaces', s.workspaces); // last: its presence marks the seed as complete
  }

  async ping() { await (await this.db()).command({ ping: 1 }); return true; }
}
