import type { Fact, Finding, Rule } from '../types';
import { sha256 } from './hash';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-term, Unicode-aware matcher (works for terms like "#1" and "100% organic"). */
export function termRegex(term: string, caseSensitive = false): RegExp {
  const body = esc(term.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, caseSensitive ? 'gu' : 'giu');
}

/** Compiles an admin-supplied pattern defensively. Returns null when it is unusable. */
export function safeRegex(source: string, flags = 'gi'): RegExp | null {
  if (!source || source.length > 300) return null;
  try {
    return new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
  } catch {
    return null;
  }
}

export const findingId = (ruleId: string, quote: string, n: number) =>
  `f_${sha256(`${ruleId}|${quote.toLowerCase()}|${n}`).slice(0, 10)}`;

/** Stable ids: same rule + same quote (+ occurrence) gets the same id across re-analyses. */
export function idGen() {
  const seen = new Map<string, number>();
  return (ruleId: string, quote: string) => {
    const key = `${ruleId}|${quote.toLowerCase()}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return findingId(ruleId, quote, n);
  };
}

const sp = (m: RegExpMatchArray) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, quote: m[0] });
const normNum = (s: string) => s.replace(/[,\s]/g, '').toLowerCase();

export function runRules(text: string, rules: Rule[], facts: Fact[], nextId = idGen()): Finding[] {
  const out: Finding[] = [];
  const factById = new Map(facts.map((f) => [f.id, f]));
  const add = (rule: Rule, span: Finding['span'], message: string, extra: Partial<Finding> = {}) => {
    out.push({
      id: nextId(rule.id, span?.quote ?? 'missing'),
      ruleId: rule.id, ruleTitle: rule.title, type: rule.type, severity: rule.severity, origin: 'rule',
      message, span, evidence: { ruleSource: rule.source }, ...extra,
    });
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;
    switch (rule.type) {
      case 'banned_term': {
        for (const term of rule.config.terms) {
          for (const m of text.matchAll(termRegex(term, rule.config.caseSensitive))) {
            add(rule, sp(m), `"${m[0]}" is not allowed in brand copy.`, {
              suggestion: rule.config.preferred ? `Use "${rule.config.preferred}" instead.` : 'Remove or reword it.',
              replacement: rule.config.preferred,
            });
          }
        }
        break;
      }
      case 'restricted_claim': {
        for (const term of rule.config.terms) {
          for (const m of text.matchAll(termRegex(term))) {
            add(rule, sp(m), `"${m[0]}" is a claim that needs an approved fact behind it.`, {
              suggestion: 'Remove it, or reword it using an approved claim.',
            });
          }
        }
        break;
      }
      case 'required_phrase': {
        let first: ReturnType<typeof sp> | null = null;
        for (const p of rule.config.triggerPatterns) {
          const re = safeRegex(p, 'gi');
          const m = re ? text.matchAll(re).next().value : undefined;
          if (m && (!first || (m.index ?? 0) < first.start)) first = sp(m);
        }
        if (!first) break;
        const present = rule.config.requiredPatterns.some((p) => safeRegex(p, 'i')?.test(text));
        if (!present) {
          add(rule, first, `Promotional wording ("${first.quote}") must carry "${rule.config.insert}".`, {
            suggestion: `Add "${rule.config.insert}" to the copy.`, append: rule.config.insert,
          });
        }
        break;
      }
      case 'fact_check': {
        const re = safeRegex(rule.config.pattern, 'gi');
        const fact = factById.get(rule.config.factId);
        if (!re || !fact) break;
        const expected = rule.config.expected.map(normNum);
        for (const m of text.matchAll(re)) {
          const got = m[1] ?? '';
          if (!got || expected.includes(normNum(got))) continue;
          add(rule, sp(m), `The copy says "${got}", but the approved fact is: ${fact.statement}`, {
            suggestion: `Use the approved figure (${rule.config.expected[0]}).`,
            replacement: m[0].replace(got, rule.config.expected[0]),
            evidence: { ruleSource: rule.source, fact: { id: fact.id, statement: fact.statement, source: fact.source } },
          });
        }
        break;
      }
      case 'style_limit': {
        const c = rule.config;
        if (c.kind === 'max_exclamations') {
          const limit = c.limit ?? 1;
          let total = 0;
          for (const m of text.matchAll(/!+/g)) {
            total += m[0].length;
            if (total > limit) {
              add(rule, sp(m), `That is exclamation mark ${total}; the guide allows ${limit} per piece.`, {
                suggestion: 'End the sentence with a full stop.', replacement: '.',
              });
            }
          }
        } else if (c.kind === 'no_all_caps') {
          const allow = new Set((c.allow ?? []).map((a) => a.toUpperCase()));
          for (const m of text.matchAll(/\b\p{Lu}{2,}(?:[ \t]+\p{Lu}{2,})*\b/gu)) {
            const words = m[0].split(/\s+/);
            if (!words.some((w) => w.length >= 4 && !allow.has(w))) continue;
            const safe = !words.some((w) => allow.has(w));
            const fixed = m[0][0] + m[0].slice(1).toLowerCase();
            add(rule, sp(m), `"${m[0]}" is set in capitals.`, {
              suggestion: safe ? `Write it as "${fixed}".` : 'Use sentence case.', replacement: safe ? fixed : undefined,
            });
          }
        } else if (c.kind === 'max_sentence_words') {
          const limit = c.limit ?? 28;
          for (const m of text.matchAll(/[^.!?\n]+[.!?]*/g)) {
            const raw = m[0];
            const lead = raw.length - raw.trimStart().length;
            const s = raw.trim();
            const words = (s.match(/\S+/g) ?? []).length;
            if (words > limit) {
              const start = (m.index ?? 0) + lead;
              add(rule, { start, end: start + s.length, quote: s }, `This sentence runs ${words} words; the guide caps sentences at ${limit}.`, {
                suggestion: 'Split it into two shorter sentences.',
              });
            }
          }
        }
        break;
      }
      case 'ai_guideline':
        break; // judged by the model only
    }
  }
  return out.sort((a, b) => (a.span?.start ?? Infinity) - (b.span?.start ?? Infinity));
}
