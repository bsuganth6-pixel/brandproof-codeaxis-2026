import type { AuditEvent, ChainStatus } from '../types';
import { canonical, sha256 } from './hash';

export const GENESIS = '0'.repeat(64);

export function eventHash(e: Omit<AuditEvent, 'hash'>): string {
  return sha256(canonical({
    id: e.id, workspaceId: e.workspaceId, seq: e.seq, at: e.at, actorId: e.actorId, actorName: e.actorName,
    actorRole: e.actorRole, action: e.action, reviewId: e.reviewId, detail: e.detail, prevHash: e.prevHash,
  }));
}

/** Events must be the complete workspace chain in ascending order. Any edit, deletion or reorder breaks it. */
export function verifyChain(events: AuditEvent[]): ChainStatus {
  let prev = GENESIS;
  let seq = 0;
  for (const e of events) {
    seq += 1;
    if (e.seq !== seq || e.prevHash !== prev || eventHash(e) !== e.hash) return { ok: false, count: events.length, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, count: events.length };
}
