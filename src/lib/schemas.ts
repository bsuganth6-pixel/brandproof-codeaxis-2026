import { z } from 'zod';

export const channelSchema = z.enum(['social', 'email', 'web', 'ad', 'press']);
const title = z.string().trim().min(3, 'Give the review a title of at least 3 characters').max(120);
const text = z.string().min(1, 'Draft text is empty').max(20000, 'Draft text is limited to 20,000 characters');

export const createReviewInput = z.object({ title, channel: channelSchema, text });
export const updateReviewInput = z
  .object({ title: title.optional(), text: text.optional() })
  .refine((v) => v.title !== undefined || v.text !== undefined, 'Nothing to update');
export const decideFindingInput = z.object({
  action: z.enum(['dismiss', 'reopen']),
  reason: z.string().trim().max(500).optional(),
});
export const transitionInput = z.object({
  action: z.enum(['submit', 'approve', 'request_changes', 'reject']),
  rationale: z.string().trim().max(1000).optional(),
});
export const createRuleInput = z.object({
  title: z.string().trim().min(3).max(100),
  terms: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
  preferred: z.string().trim().max(60).optional(),
  severity: z.enum(['critical', 'major', 'minor']),
  sourceDoc: z.string().trim().min(2).max(100),
  sourceQuote: z.string().trim().min(8).max(300),
});
export const patchRuleInput = z.object({ enabled: z.boolean() });
export const loginInput = z.union([
  z.object({ role: z.enum(['admin', 'author', 'approver']) }),
  z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }),
]);
