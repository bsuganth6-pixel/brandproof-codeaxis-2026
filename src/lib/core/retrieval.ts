import type { Rule } from '../types';

const STOP = new Set('the and for with that this from your you our are was were has have not but all any can will its their they them his her she him who what when where which would could should about into over under more most some such than then there these those been being also just only very'.split(' '));

export const tokenize = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 2 && !STOP.has(t));

function ruleDoc(r: Rule): string {
  const extra = r.type === 'banned_term' || r.type === 'restricted_claim' ? r.config.terms.join(' ') : r.type === 'ai_guideline' ? r.config.guidance : '';
  return [r.title, r.description, r.source.quote, extra, r.tags.join(' ')].join(' ');
}

/**
 * BM25 retrieval of the rules most relevant to a draft. Guideline rules (judged only by the model)
 * are always included so the model never misses a tone rule because of keyword luck.
 */
export function retrieveRules(text: string, rules: Rule[], k = 8): Rule[] {
  const docs = rules.map((r) => tokenize(ruleDoc(r)));
  const N = docs.length || 1;
  const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const query = [...new Set(tokenize(text))];
  const k1 = 1.4, b = 0.75;
  const scored = rules.map((r, i) => {
    const d = docs[i];
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    let s = 0;
    for (const t of query) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
    }
    return { r, s };
  });
  const always = rules.filter((r) => r.type === 'ai_guideline');
  const top = scored
    .filter((x) => x.s > 0 && x.r.type !== 'ai_guideline')
    .sort((a, b2) => b2.s - a.s)
    .slice(0, Math.max(0, k - always.length))
    .map((x) => x.r);
  return [...always, ...top];
}
