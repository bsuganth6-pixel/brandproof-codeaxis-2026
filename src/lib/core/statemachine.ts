import type { Review, ReviewStatus, Role } from '../types';

export type Action = 'analyze' | 'edit' | 'submit' | 'approve' | 'request_changes' | 'reject';

export const TRANSITIONS: Record<ReviewStatus, Partial<Record<Action, ReviewStatus>>> = {
  draft: { analyze: 'analyzed', edit: 'draft' },
  analyzed: { analyze: 'analyzed', edit: 'draft', submit: 'in_review' },
  in_review: { approve: 'approved', request_changes: 'changes_requested', reject: 'rejected', edit: 'draft' },
  changes_requested: { edit: 'draft' },
  rejected: { edit: 'draft' },
  approved: { edit: 'draft' },
};

const ROLES: Record<Action, Role[]> = {
  analyze: ['author', 'admin'], edit: ['author', 'admin'], submit: ['author', 'admin'],
  approve: ['approver', 'admin'], request_changes: ['approver', 'admin'], reject: ['approver', 'admin'],
};

const VERB: Record<Action, string> = {
  analyze: 'run analysis on', edit: 'edit', submit: 'submit', approve: 'approve', request_changes: 'request changes on', reject: 'reject',
};

export type Guard = { ok: true; next: ReviewStatus } | { ok: false; status: number; code: string; message: string };
export interface GuardInput {
  actor: { id: string; role: Role };
  openCritical: number;
  analysisCurrent: boolean;
  rationale?: string;
}

export function guard(review: Pick<Review, 'status' | 'createdBy' | 'submittedBy'>, action: Action, g: GuardInput): Guard {
  const deny = (status: number, code: string, message: string): Guard => ({ ok: false, status, code, message });
  if (!ROLES[action].includes(g.actor.role)) return deny(403, 'forbidden_role', `Your role (${g.actor.role}) cannot ${VERB[action]} a review.`);
  const next = TRANSITIONS[review.status][action];
  if (!next) return deny(409, 'invalid_transition', `You cannot ${VERB[action]} a review that is ${review.status.replace('_', ' ')}.`);
  if ((action === 'analyze' || action === 'edit' || action === 'submit') && review.createdBy !== g.actor.id && g.actor.role !== 'admin') {
    return deny(403, 'not_owner', 'Only the author or an admin can change this draft.');
  }
  if ((action === 'submit' || action === 'approve') && !g.analysisCurrent) {
    return deny(409, 'stale_analysis', 'The analysis does not match the current text. Run the analysis again.');
  }
  if (action === 'approve') {
    if (review.submittedBy === g.actor.id) return deny(403, 'self_approval', 'You submitted this draft, so someone else has to approve it.');
    if (g.openCritical > 0) {
      return deny(409, 'open_critical', `${g.openCritical} critical finding${g.openCritical > 1 ? 's are' : ' is'} still open. Dismiss each with a reason, or ask for changes.`);
    }
  }
  if ((action === 'request_changes' || action === 'reject') && (g.rationale ?? '').trim().length < 8) {
    return deny(422, 'rationale_required', 'Add a rationale of at least 8 characters so the author knows what to fix.');
  }
  return { ok: true, next };
}

/** An approval only counts while the text still hashes to what the approver saw. */
export function isApprovalValid(r: Pick<Review, 'status' | 'decisions' | 'contentHash'>): boolean {
  const last = r.decisions[r.decisions.length - 1];
  return r.status === 'approved' && !!last && last.action === 'approved' && last.contentHash === r.contentHash;
}
