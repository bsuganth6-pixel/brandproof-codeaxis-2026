import { describe, expect, it } from 'vitest';
import { eventHash, GENESIS, verifyChain } from '@/lib/core/audit';
import { guard, isApprovalValid } from '@/lib/core/statemachine';
import type { AuditEvent, Review } from '@/lib/types';

const base = { status: 'analyzed', createdBy: 'a1', submittedBy: undefined } as Pick<Review, 'status' | 'createdBy' | 'submittedBy'>;
const ok = { openCritical: 0, analysisCurrent: true };

describe('state machine', () => {
  it('lets the owning author submit a current analysis', () => {
    expect(guard(base, 'submit', { ...ok, actor: { id: 'a1', role: 'author' } })).toEqual({ ok: true, next: 'in_review' });
  });
  it('blocks submission on a stale analysis', () => {
    const g = guard(base, 'submit', { ...ok, analysisCurrent: false, actor: { id: 'a1', role: 'author' } });
    expect(g).toMatchObject({ ok: false, code: 'stale_analysis' });
  });
  it('blocks other authors from touching a draft but lets admins in', () => {
    expect(guard(base, 'edit', { ...ok, actor: { id: 'zz', role: 'author' } })).toMatchObject({ ok: false, code: 'not_owner' });
    expect(guard(base, 'edit', { ...ok, actor: { id: 'zz', role: 'admin' } })).toMatchObject({ ok: true });
  });
  it('keeps approvals with approvers and admins', () => {
    const r = { ...base, status: 'in_review', submittedBy: 'a1' } as typeof base;
    expect(guard(r, 'approve', { ...ok, actor: { id: 'a1', role: 'author' } })).toMatchObject({ ok: false, code: 'forbidden_role' });
    expect(guard(r, 'approve', { ...ok, actor: { id: 'm1', role: 'approver' } })).toMatchObject({ ok: true, next: 'approved' });
  });
  it('forbids approving your own submission, even as admin', () => {
    const r = { ...base, status: 'in_review', submittedBy: 'p1' } as typeof base;
    expect(guard(r, 'approve', { ...ok, actor: { id: 'p1', role: 'admin' } })).toMatchObject({ ok: false, code: 'self_approval' });
  });
  it('blocks approval while a critical finding is open', () => {
    const r = { ...base, status: 'in_review', submittedBy: 'a1' } as typeof base;
    expect(guard(r, 'approve', { ...ok, openCritical: 2, actor: { id: 'm1', role: 'approver' } })).toMatchObject({ ok: false, code: 'open_critical' });
  });
  it('requires a rationale to reject or request changes', () => {
    const r = { ...base, status: 'in_review', submittedBy: 'a1' } as typeof base;
    expect(guard(r, 'reject', { ...ok, actor: { id: 'm1', role: 'approver' }, rationale: 'no' })).toMatchObject({ ok: false, code: 'rationale_required' });
    expect(guard(r, 'request_changes', { ...ok, actor: { id: 'm1', role: 'approver' }, rationale: 'Fix the claim in line 2.' })).toMatchObject({ ok: true });
  });
  it('rejects transitions that the table does not allow', () => {
    const r = { ...base, status: 'approved' } as typeof base;
    expect(guard(r, 'submit', { ...ok, actor: { id: 'a1', role: 'author' } })).toMatchObject({ ok: false, code: 'invalid_transition' });
  });
  it('an approval is valid only while the content hash matches', () => {
    const dec = { action: 'approved', contentHash: 'h1' } as Review['decisions'][number];
    expect(isApprovalValid({ status: 'approved', decisions: [dec], contentHash: 'h1' })).toBe(true);
    expect(isApprovalValid({ status: 'approved', decisions: [dec], contentHash: 'h2' })).toBe(false);
    expect(isApprovalValid({ status: 'draft', decisions: [dec], contentHash: 'h1' })).toBe(false);
  });
});

function chain(n: number): AuditEvent[] {
  const out: AuditEvent[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const e = { id: `e${i}`, workspaceId: 'w', seq: i, at: `2026-10-0${i}T00:00:00.000Z`, actorId: 'u', actorName: 'U', actorRole: 'author' as const, action: 'x', detail: { i }, prevHash: prev };
    const ev: AuditEvent = { ...e, hash: eventHash(e) };
    out.push(ev);
    prev = ev.hash;
  }
  return out;
}

describe('audit hash chain', () => {
  it('verifies an intact chain', () => expect(verifyChain(chain(5))).toEqual({ ok: true, count: 5 }));
  it('detects an edited event', () => {
    const c = chain(5);
    c[2] = { ...c[2], detail: { i: 999 } };
    expect(verifyChain(c)).toMatchObject({ ok: false, brokenAt: 3 });
  });
  it('detects a deleted event', () => {
    const c = chain(5);
    c.splice(1, 1);
    expect(verifyChain(c).ok).toBe(false);
  });
  it('detects reordered events', () => {
    const c = chain(4);
    [c[1], c[2]] = [c[2], c[1]];
    expect(verifyChain(c).ok).toBe(false);
  });
});
