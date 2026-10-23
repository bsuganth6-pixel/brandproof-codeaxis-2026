import { describe, expect, it } from 'vitest';
import { runRules } from '@/lib/core/engine';
import { seedFacts, seedRules } from '@/lib/seed';
import type { Finding } from '@/lib/types';

const run = (t: string) => runRules(t, seedRules, seedFacts);
const of = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

describe('deterministic rule engine', () => {
  it('flags a mis-cased brand name and offers the exact fix', () => {
    const f = of(run('Visit Kaveri roasters today.'), 'rule_brand_name');
    expect(f).toHaveLength(1);
    expect(f[0].span?.quote).toBe('Kaveri roasters');
    expect(f[0].replacement).toBe('Kaveri Roasters');
    expect(f[0].evidence.ruleSource.quote).toContain('Kaveri Roasters');
  });

  it('accepts the exact brand name, including the plural that contains a banned prefix', () => {
    expect(of(run('Kaveri Roasters is open.'), 'rule_brand_name')).toHaveLength(0);
  });

  it('matches whole terms only', () => {
    expect(of(run('A cheaper option'), 'rule_no_cheap')).toHaveLength(0);
    expect(of(run('A CHEAP option'), 'rule_no_cheap')).toHaveLength(1);
  });

  it('matches symbol terms such as #1', () => {
    const f = of(run('We are #1 in Chennai'), 'rule_superlatives');
    expect(f).toHaveLength(1);
    expect(f[0].span?.quote).toBe('#1');
  });

  it('requires "T&C apply" when a price is promoted', () => {
    expect(of(run('Enjoy 20% off this week.'), 'rule_promo_tnc')).toHaveLength(1);
    expect(of(run('Enjoy 20% off this week. T&C apply.'), 'rule_promo_tnc')).toHaveLength(0);
    expect(of(run('Fresh roasted beans.'), 'rule_promo_tnc')).toHaveLength(0);
  });

  it('checks figures against approved facts and links the fact as evidence', () => {
    const f = of(run('Founded in 2010 in Coimbatore.'), 'rule_fact_founded');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('critical');
    expect(f[0].replacement).toBe('Founded in 2012');
    expect(f[0].evidence.fact?.statement).toContain('2012');
    expect(f[0].evidence.fact?.source.doc).toContain('fact sheet');
  });

  it('accepts figures that match the record', () => {
    const fs = run('Founded in 2012, delivered to 14 countries, Fairtrade certified since 2018.');
    expect(fs.filter((f) => f.type === 'fact_check')).toHaveLength(0);
  });

  it('enforces the exclamation limit from the second mark on', () => {
    const f = of(run('Wow! Great! Amazing!'), 'rule_style_exclaim');
    expect(f.map((x) => x.span?.quote)).toEqual(['!', '!']);
  });

  it('flags capital-letter phrases once, not word by word, and ignores allowed acronyms', () => {
    const f = of(run('OUR BEANS are great. Pay by UPI. T&C apply.'), 'rule_style_caps');
    expect(f).toHaveLength(1);
    expect(f[0].span?.quote).toBe('OUR BEANS');
    expect(f[0].replacement).toBe('Our beans');
  });

  it('flags sentences over the word limit', () => {
    const long = `${Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')}.`;
    expect(of(run(`Short one. ${long}`), 'rule_style_sentence')).toHaveLength(1);
  });

  it('skips disabled rules', () => {
    const off = seedRules.map((r) => (r.id === 'rule_no_cheap' ? { ...r, enabled: false } : r));
    expect(of(runRules('so cheap', off, seedFacts), 'rule_no_cheap')).toHaveLength(0);
  });

  it('gives findings stable ids across runs and distinct ids for repeats', () => {
    const a = of(run('cheap cheap'), 'rule_no_cheap');
    const b = of(run('cheap cheap'), 'rule_no_cheap');
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(new Set(a.map((f) => f.id)).size).toBe(2);
  });

  it('every finding carries a span inside the text and a brand-guide quote', () => {
    const text = 'OUR CHEAP BEANS are #1!!! Founded in 2010. Our cold brew cures tiredness. 50% off today.';
    for (const f of run(text)) {
      expect(f.span).not.toBeNull();
      expect(text.slice(f.span!.start, f.span!.end)).toBe(f.span!.quote);
      expect(f.evidence.ruleSource.quote.length).toBeGreaterThan(5);
    }
  });
});
