import type { Fact, Finding, Rule } from '../types';
import type { AnalyzeRequest, LLMProvider, RawAIFinding } from '../llm/types';
import { idGen } from './engine';
import { locateQuote } from './quotes';
import { retrieveRules } from './retrieval';

export interface AIOutcome { findings: Finding[]; proposed: number; rejected: number; reasons: string[] }

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

function describe(r: Rule): string {
  if (r.type === 'ai_guideline') return `${r.description} ${r.config.guidance}`.trim();
  if (r.type === 'banned_term' || r.type === 'restricted_claim') return `${r.description} Terms: ${r.config.terms.join(', ')}.`;
  return r.description;
}

/**
 * The hallucination guard. A model finding survives only if it cites a rule we offered AND its
 * quote is found verbatim (modulo case/whitespace/curly quotes) in the draft. Everything else is dropped.
 */
export function verifyAI(text: string, raw: RawAIFinding[], offered: Rule[], nextId = idGen()): AIOutcome {
  const byId = new Map(offered.map((r) => [r.id, r]));
  const findings: Finding[] = [];
  const reasons: string[] = [];
  for (const item of raw) {
    const rule = byId.get(item.ruleId);
    if (!rule) { reasons.push(`unknown rule "${item.ruleId}"`); continue; }
    const loc = locateQuote(text, item.quote);
    if (!loc) { reasons.push(`quote not found in draft (${rule.id})`); continue; }
    if (findings.some((f) => f.ruleId === rule.id && f.span && overlaps(f.span, loc))) { reasons.push('duplicate'); continue; }
    findings.push({
      id: nextId(rule.id, loc.quote), ruleId: rule.id, ruleTitle: rule.title, type: rule.type,
      severity: rule.severity, origin: 'ai',
      message: item.explanation.slice(0, 400),
      suggestion: item.suggestion?.slice(0, 300),
      span: loc, evidence: { ruleSource: rule.source }, confidence: item.confidence,
    });
  }
  return { findings, proposed: raw.length, rejected: raw.length - findings.length, reasons };
}

/** Drops model findings that duplicate a rule-engine finding for the same rule and span. */
export function mergeFindings(ruleFindings: Finding[], aiFindings: Finding[]): Finding[] {
  const kept = aiFindings.filter(
    (a) => !ruleFindings.some((r) => r.ruleId === a.ruleId && r.span && a.span && overlaps(r.span, a.span)),
  );
  return [...ruleFindings, ...kept].sort((a, b) => (a.span?.start ?? Infinity) - (b.span?.start ?? Infinity));
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('AI analysis timed out.')), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export async function runAI(
  llm: LLMProvider, text: string, rules: Rule[], facts: Fact[], nextId = idGen(), timeoutMs = 25000,
): Promise<AIOutcome> {
  const offered = retrieveRules(text, rules, 8);
  if (!offered.length) return { findings: [], proposed: 0, rejected: 0, reasons: [] };
  const req: AnalyzeRequest = {
    text,
    rules: offered.map((r) => ({ id: r.id, title: r.title, severity: r.severity, guidance: describe(r), brandGuideQuote: r.source.quote, tags: r.tags })),
    facts: facts.map((f) => ({ id: f.id, statement: f.statement })),
  };
  const raw = await withTimeout(llm.analyze(req), timeoutMs);
  return verifyAI(text, raw, offered, nextId);
}
