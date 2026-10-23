import { describe, expect, it } from 'vitest';
import { mergeFindings, verifyAI } from '@/lib/core/ai';
import { locateQuote } from '@/lib/core/quotes';
import { retrieveRules } from '@/lib/core/retrieval';
import { parseAIResponse } from '@/lib/llm/prompt';
import { seedRules } from '@/lib/seed';
import type { Finding } from '@/lib/types';

describe('quote verification', () => {
  const text = 'It’s the   BEST coffee\nin town.';
  it('finds exact quotes', () => expect(locateQuote(text, 'in town')).toMatchObject({ start: text.indexOf('in town') }));
  it('tolerates case, curly quotes and whitespace and returns the original span', () => {
    const a = locateQuote(text, "it's the best coffee in town");
    expect(a).not.toBeNull();
    expect(text.slice(a!.start, a!.end)).toBe('It’s the   BEST coffee\nin town');
  });
  it('rejects quotes that are not in the text', () => expect(locateQuote(text, 'cheapest in India')).toBeNull());
  it('rejects tiny and oversized quotes', () => {
    expect(locateQuote(text, 'it')).toBeNull();
    expect(locateQuote('a'.repeat(500), 'a'.repeat(450))).toBeNull();
  });
});

describe('retrieval', () => {
  it('surfaces the rule that matches the draft and always includes guideline rules', () => {
    const r = retrieveRules('Get 20% discount on our coffee this sale', seedRules, 5);
    expect(r.map((x) => x.id)).toContain('rule_promo_tnc');
    expect(r.filter((x) => x.type === 'ai_guideline')).toHaveLength(2);
    expect(r.length).toBeLessThanOrEqual(5);
  });
  it('returns only guideline rules when nothing else is relevant', () => {
    const r = retrieveRules('zzz qqq', seedRules, 8);
    expect(r.every((x) => x.type === 'ai_guideline')).toBe(true);
  });
});

describe('model output guard', () => {
  const offered = seedRules.filter((r) => ['rule_tone_pressure', 'rule_no_cheap'].includes(r.id));
  const text = 'Hurry, this is the cheapest coffee!';

  it('keeps verified findings and drops hallucinated quotes, unknown rules and duplicates', () => {
    const out = verifyAI(text, [
      { ruleId: 'rule_tone_pressure', quote: 'Hurry', explanation: 'pressure' },
      { ruleId: 'rule_tone_pressure', quote: 'last chance', explanation: 'invented' },
      { ruleId: 'rule_made_up', quote: 'cheapest', explanation: 'unknown rule' },
      { ruleId: 'rule_no_cheap', quote: 'CHEAPEST', explanation: 'case differs' },
      { ruleId: 'rule_no_cheap', quote: 'cheapest', explanation: 'duplicate' },
    ], offered);
    expect(out.findings.map((f) => f.span?.quote)).toEqual(['Hurry', 'cheapest']);
    expect(out.proposed).toBe(5);
    expect(out.rejected).toBe(3);
    expect(out.reasons.join(' ')).toMatch(/unknown rule/);
    expect(out.reasons.join(' ')).toMatch(/quote not found/);
    expect(out.findings.every((f) => f.origin === 'ai' && f.evidence.ruleSource.quote)).toBe(true);
  });

  it('takes severity from the rule, never from the model', () => {
    const out = verifyAI(text, [{ ruleId: 'rule_no_cheap', quote: 'cheapest', explanation: 'x', confidence: 0.2 }], offered);
    expect(out.findings[0].severity).toBe('major');
  });

  it('drops a model finding that repeats a rule-engine finding', () => {
    const ruleF = { id: 'a', ruleId: 'rule_no_cheap', span: { start: 20, end: 28, quote: 'cheapest' } } as Finding;
    const aiF = { id: 'b', ruleId: 'rule_no_cheap', span: { start: 20, end: 28, quote: 'cheapest' } } as Finding;
    expect(mergeFindings([ruleF], [aiF])).toHaveLength(1);
  });

  it('parses fenced JSON and skips malformed items', () => {
    const raw = '```json\n{"findings":[{"ruleId":"a","quote":"q q q","explanation":"e","confidence":0.9},{"bad":1}]}\n```';
    expect(parseAIResponse(raw)).toHaveLength(1);
  });
  it('throws on non-JSON and on a missing findings array', () => {
    expect(() => parseAIResponse('Sorry, I cannot help')).toThrow();
    expect(() => parseAIResponse('{"findings":"none"}')).toThrow();
  });
});
