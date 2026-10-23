import { MemoryRepo } from './db/memory';
import type { Repo, Snapshot } from './db/repo';
import { MockProvider } from './llm/mock';
import { hashPassword } from './password';
import { analyzeReview, createReview, decideFinding, transitionReview, updateDraft, type Actor, type Ctx } from './services';
import type { Fact, Rule, User, Workspace } from './types';

export const WS_ID = 'ws_kaveri';
const GUIDE = 'Kaveri Roasters brand guide v3.2';
const SHEET = 'Kaveri fact sheet, September 2026';
const T0 = '2026-10-12T03:30:00.000Z';
const base = { workspaceId: WS_ID, enabled: true, version: 1, updatedAt: T0 };

const workspace: Workspace = { id: WS_ID, name: 'Kaveri Roasters', guideName: GUIDE, createdAt: T0 };

const facts: Fact[] = [
  { id: 'fact_founded', workspaceId: WS_ID, statement: 'Kaveri Roasters was founded in 2012 in Coimbatore.', source: { doc: SHEET, quote: 'Founded 2012, Coimbatore, Tamil Nadu.' } },
  { id: 'fact_countries', workspaceId: WS_ID, statement: 'Kaveri Roasters delivers to 14 countries.', source: { doc: SHEET, quote: 'Delivery footprint: 14 countries as of September 2026.' } },
  { id: 'fact_fairtrade', workspaceId: WS_ID, statement: 'Kaveri Roasters has been Fairtrade certified since 2018.', source: { doc: SHEET, quote: 'Fairtrade certification: active since 2018.' } },
];

const rules: Rule[] = [
  { ...base, id: 'rule_brand_name', type: 'banned_term', title: 'Write the brand name exactly', description: 'The name is two capitalised words. No respellings or abbreviations.', severity: 'major', tags: ['terminology'],
    source: { doc: GUIDE, quote: 'Our name is Kaveri Roasters: two words, both capitalised, never abbreviated or respelled.' },
    config: { terms: ['Kaveri roasters', 'Kaveri Roaster', 'Cauvery Roasters', 'KR Coffee'], preferred: 'Kaveri Roasters', caseSensitive: true } },
  { ...base, id: 'rule_no_cheap', type: 'banned_term', title: 'Say affordable, not cheap', description: 'Price language must signal value, never low quality.', severity: 'major', tags: ['terminology', 'price'],
    source: { doc: GUIDE, quote: 'Never call our coffee cheap. Say affordable or great value.' },
    config: { terms: ['cheap', 'cheapest', 'cheaply'], preferred: 'affordable' } },
  { ...base, id: 'rule_no_addiction', type: 'banned_term', title: 'No jokes about addiction', description: 'Do not frame coffee as an addiction.', severity: 'major', tags: ['terminology', 'sensitivity'],
    source: { doc: GUIDE, quote: 'Do not joke about addiction. Say devoted, not addicted.' },
    config: { terms: ['addicted', 'addiction', 'junkie'], preferred: 'devoted' } },
  { ...base, id: 'rule_superlatives', type: 'restricted_claim', title: 'Back up superlatives', description: 'Ranking claims need an approved fact behind them.', severity: 'major', tags: ['claims', 'superlative', 'best', 'largest'],
    source: { doc: GUIDE, quote: 'Superlatives need proof. Do not claim best, number one, finest or largest unless an approved fact supports it.' },
    config: { terms: ['best', '#1', 'number one', 'finest', 'largest', 'world-class', 'unbeatable'] } },
  { ...base, id: 'rule_health_claims', type: 'restricted_claim', title: 'No health claims or guarantees', description: 'We make no medical, wellness or guarantee claims.', severity: 'critical', tags: ['claims', 'health', 'legal'],
    source: { doc: GUIDE, quote: 'We make no health claims and no guarantees. Ever.' },
    config: { terms: ['cures', 'cure', 'detox', 'boosts immunity', 'weight loss', 'miracle', 'guaranteed', '100% organic'] } },
  { ...base, id: 'rule_promo_tnc', type: 'required_phrase', title: 'Promotions carry "T&C apply"', description: 'Any message that promotes a price must include the T&C line.', severity: 'major', tags: ['legal', 'promotion', 'discount'],
    source: { doc: GUIDE, quote: 'Every promotional message must say "T&C apply".' },
    config: { triggerPatterns: ['\\b\\d{1,3}\\s?%\\s?off\\b', '\\bdiscount\\b', '\\bcoupon\\b', '\\bfree shipping\\b', '\\bsale\\b'], requiredPatterns: ['T&Cs? apply', 'terms (?:and|&) conditions apply'], insert: 'T&C apply' } },
  { ...base, id: 'rule_fact_founded', type: 'fact_check', title: 'Founding year matches the record', description: 'Copy must not misstate when we were founded.', severity: 'critical', tags: ['facts', 'founded'],
    source: { doc: GUIDE, quote: 'Only use figures from the fact sheet. Never round, estimate or improve them.' },
    config: { factId: 'fact_founded', pattern: '(?:founded|established|began)\\s+(?:in\\s+)?(\\d{4})', expected: ['2012'] } },
  { ...base, id: 'rule_fact_countries', type: 'fact_check', title: 'Country count matches the record', description: 'Copy must not misstate where we deliver.', severity: 'critical', tags: ['facts', 'countries', 'delivery'],
    source: { doc: GUIDE, quote: 'Only use figures from the fact sheet. Never round, estimate or improve them.' },
    config: { factId: 'fact_countries', pattern: '(?:available|shipping|shipped|delivered|deliver)\\s+(?:in|to)\\s+(\\d+)\\s+countries', expected: ['14'] } },
  { ...base, id: 'rule_fact_fairtrade', type: 'fact_check', title: 'Fairtrade year matches the record', description: 'Copy must not misstate our certification date.', severity: 'critical', tags: ['facts', 'fairtrade', 'certification'],
    source: { doc: GUIDE, quote: 'Only use figures from the fact sheet. Never round, estimate or improve them.' },
    config: { factId: 'fact_fairtrade', pattern: 'fair[- ]?trade(?:\\s+certified)?\\s+since\\s+(\\d{4})', expected: ['2018'] } },
  { ...base, id: 'rule_style_exclaim', type: 'style_limit', title: 'One exclamation mark at most', description: 'Enthusiasm comes from the writing, not the punctuation.', severity: 'minor', tags: ['style'],
    source: { doc: GUIDE, quote: 'One exclamation mark per post, at most.' }, config: { kind: 'max_exclamations', limit: 1 } },
  { ...base, id: 'rule_style_caps', type: 'style_limit', title: 'No shouting in capitals', description: 'Do not set whole words or phrases in capitals.', severity: 'minor', tags: ['style'],
    source: { doc: GUIDE, quote: 'Do not shout. No all-caps phrases.' }, config: { kind: 'no_all_caps', allow: ['T&C', 'FAQ', 'USA', 'INR', 'UPI', 'MRP', 'GST'] } },
  { ...base, id: 'rule_style_sentence', type: 'style_limit', title: 'Keep sentences short', description: 'Long sentences lose readers on a phone.', severity: 'minor', tags: ['style', 'readability'],
    source: { doc: GUIDE, quote: 'Keep sentences under 28 words.' }, config: { kind: 'max_sentence_words', limit: 28 } },
  { ...base, id: 'rule_tone_pressure', type: 'ai_guideline', title: 'Invite, never pressure', description: 'Warm and never pushy: no manufactured urgency.', severity: 'major', tags: ['tone', 'pressure'],
    source: { doc: GUIDE, quote: 'We invite, we do not pressure. No last-chance or hurry language.' },
    config: { guidance: 'Flag manufactured urgency such as "hurry", "last chance", "act now" or "today only". A plain factual deadline is acceptable.' } },
  { ...base, id: 'rule_tone_competitor', type: 'ai_guideline', title: 'Never run down other roasters', description: 'Describe what makes us good, not what makes others bad.', severity: 'major', tags: ['tone', 'competitor'],
    source: { doc: GUIDE, quote: 'We never run down other roasters.' },
    config: { guidance: 'Flag copy that names a competitor in order to criticise or compare unfavourably.' } },
];

export const SEED_TEXTS = {
  diwaliBad: 'Gift them the Diwali Gift Box — three single-origin roasts from Kaveri roasters, hand-packed in Coimbatore. Founded in 2011, we have been roasting with care ever since. Wrap up something warm this festive season.',
  diwaliGood: 'Gift them the Diwali Gift Box — three single-origin roasts from Kaveri Roasters, hand-packed in Coimbatore. Founded in 2012, we have been roasting with care ever since. Wrap up something warm this festive season.',
  monsoon: 'Beat the rain with 20% off our cold brew — the BEST in town!! Offer ends tonight, so hurry and stock up before it is gone.',
  pongal: 'Pongal mornings call for filter coffee. Brewed slow, poured proud — Kaveri Roasters.',
  press: "Kaveri Roasters is India's largest specialty roaster and the finest coffee you can buy. Our new Chennai café opens on 1 November.",
  fairtrade: 'Fair-trade certified since 2017, and still pouring slow. Thank you for drinking with us.',
  founders: 'Kaveri Roasters began in 2012 as a two-person roastery in Coimbatore, and over the years we have grown from a single wood-fired drum roaster into a team that sources directly from smallholder farms across the Western Ghats while still hand-checking every batch ourselves. Today our beans are delivered to 14 countries. Fair-trade certified since 2018.',
  flash: 'OUR CHEAP BEANS ARE THE #1 COFFEE IN THE WORLD!!! Founded in 2010 and now shipping to 20 countries. Our cold brew cures tiredness, guaranteed. 50% off today only — hurry, last chance! Cauvery Roasters.',
};

export async function buildSeed(): Promise<Snapshot> {
  const pw = hashPassword(process.env.DEMO_PASSWORD || 'proof-demo-2026');
  const users: User[] = [
    { id: 'usr_admin', workspaceId: WS_ID, email: 'priya@kaveri.demo', name: 'Priya Raman', role: 'admin', passwordHash: pw },
    { id: 'usr_author', workspaceId: WS_ID, email: 'arun@kaveri.demo', name: 'Arun Kumar', role: 'author', passwordHash: pw },
    { id: 'usr_approver', workspaceId: WS_ID, email: 'meera@kaveri.demo', name: 'Meera Nair', role: 'approver', passwordHash: pw },
  ];
  const repo = new MemoryRepo();
  await repo.importAll({ workspaces: [workspace], users, rules, facts, reviews: [], audit: [] });

  let t = Date.UTC(2026, 9, 12, 4, 0);
  let n = 0;
  const ctx: Ctx = { repo, llm: new MockProvider(), now: () => new Date(t), id: (p) => `${p}_${String(++n).padStart(4, '0')}` };
  const at = (d: number, h: number, m: number) => { t = Date.UTC(2026, 9, d, h, m); };
  const adv = (min: number) => { t += min * 60000; };
  const actor = (u: User): Actor => ({ id: u.id, name: u.name, role: u.role, workspaceId: WS_ID });
  const [admin, author, approver] = users.map(actor);
  void admin;

  // Diwali: caught two issues, fixed, approved
  at(12, 4, 0);
  let r = await createReview(ctx, author, { title: 'Diwali gift box launch', channel: 'social', text: SEED_TEXTS.diwaliBad });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  adv(24); r = await updateDraft(ctx, author, r.id, { text: SEED_TEXTS.diwaliGood });
  adv(2); r = await analyzeReview(ctx, author, r.id);
  adv(5); r = await transitionReview(ctx, author, r.id, 'submit');
  adv(190); await transitionReview(ctx, approver, r.id, 'approve', 'Facts match the fact sheet and the tone is on brand.');

  // Monsoon promo: author dismissed one AI finding, approver asked for changes
  at(14, 5, 0);
  r = await createReview(ctx, author, { title: 'Monsoon cold brew offer', channel: 'email', text: SEED_TEXTS.monsoon });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  const deadline = r.findings.find((f) => f.origin === 'ai' && /ends tonight/i.test(f.span?.quote ?? ''));
  if (deadline) {
    adv(4);
    r = await decideFinding(ctx, author, r.id, deadline.id, { action: 'dismiss', reason: 'The offer genuinely ends tonight, so this is a factual deadline.' });
  }
  adv(4); r = await transitionReview(ctx, author, r.id, 'submit');
  adv(95); await transitionReview(ctx, approver, r.id, 'request_changes', 'Remove the BEST claim and add the T&C line before this goes out.');

  // Pongal reel: clean first pass, approved fast
  at(15, 4, 30);
  r = await createReview(ctx, author, { title: 'Pongal filter coffee reel', channel: 'social', text: SEED_TEXTS.pongal });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  adv(3); r = await transitionReview(ctx, author, r.id, 'submit');
  adv(40); await transitionReview(ctx, approver, r.id, 'approve', 'Clean and on brand.');

  // Press note: unsupported superlatives, rejected
  at(16, 6, 0);
  r = await createReview(ctx, author, { title: 'Chennai café opening press note', channel: 'press', text: SEED_TEXTS.press });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  adv(6); r = await transitionReview(ctx, author, r.id, 'submit');
  adv(150); await transitionReview(ctx, approver, r.id, 'reject', 'Neither "largest" nor "finest" is backed by an approved fact.');

  // Fairtrade anniversary: critical fact mismatch, overridden by the approver with a written reason
  at(18, 5, 0);
  r = await createReview(ctx, author, { title: 'Fairtrade anniversary post', channel: 'social', text: SEED_TEXTS.fairtrade });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  adv(8); r = await transitionReview(ctx, author, r.id, 'submit');
  adv(30);
  const mismatch = r.findings.find((f) => f.severity === 'critical');
  if (mismatch) {
    r = await decideFinding(ctx, approver, r.id, mismatch.id, { action: 'dismiss', reason: 'The Fairtrade audit letter dated 3 Oct confirms 2017. The fact sheet is being corrected.' });
  }
  adv(5); await transitionReview(ctx, approver, r.id, 'approve', 'Override recorded. The fact sheet correction is tracked with the brand team.');

  // Founders story: waiting for Meera
  at(20, 5, 0);
  r = await createReview(ctx, author, { title: 'Founders story blog intro', channel: 'web', text: SEED_TEXTS.founders });
  adv(1); r = await analyzeReview(ctx, author, r.id);
  adv(19); await transitionReview(ctx, author, r.id, 'submit');

  // Weekend flash sale: analysed, full of problems, ready for the live demo
  at(21, 11, 0);
  r = await createReview(ctx, author, { title: 'Weekend flash sale post', channel: 'social', text: SEED_TEXTS.flash });
  adv(1); await analyzeReview(ctx, author, r.id);

  return repo.snapshot();
}

export async function ensureSeeded(repo: Repo): Promise<void> {
  if (await repo.getWorkspace(WS_ID)) return;
  await repo.importAll(await buildSeed());
}

export const seedRules = rules;
export const seedFacts = facts;
