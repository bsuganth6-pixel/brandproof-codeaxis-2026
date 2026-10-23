import { AddRuleForm, RuleToggle } from '@/components/BrandControls';
import { Shell } from '@/components/Shell';
import { Hash, SeverityTag } from '@/components/ui';
import { getBrand } from '@/lib/services';
import { pageActor } from '@/lib/session';
import type { Rule, RuleType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const GROUPS: { title: string; types: RuleType[] }[] = [
  { title: 'Terminology', types: ['banned_term'] },
  { title: 'Claims', types: ['restricted_claim'] },
  { title: 'Required wording', types: ['required_phrase'] },
  { title: 'Facts', types: ['fact_check'] },
  { title: 'Style', types: ['style_limit'] },
  { title: 'Tone, judged by the model', types: ['ai_guideline'] },
];

function Detail({ rule }: { rule: Rule }) {
  const chip = (t: string) => <span key={t} className="rounded bg-line-2 px-1.5 py-0.5 text-xs text-ink">{t}</span>;
  switch (rule.type) {
    case 'banned_term': return <div className="flex flex-wrap items-center gap-1.5">{rule.config.terms.map(chip)}{rule.config.preferred && <span className="text-xs text-ink-2">use “{rule.config.preferred}”</span>}</div>;
    case 'restricted_claim': return <div className="flex flex-wrap gap-1.5">{rule.config.terms.map(chip)}</div>;
    case 'required_phrase': return <p className="text-xs text-ink-2">Must include “{rule.config.insert}” whenever a price is promoted.</p>;
    case 'fact_check': return <p className="text-xs text-ink-2">Expected value: {rule.config.expected.join(', ')}</p>;
    case 'style_limit': return <p className="text-xs text-ink-2">{rule.config.kind === 'max_exclamations' ? `Up to ${rule.config.limit ?? 1} exclamation mark` : rule.config.kind === 'max_sentence_words' ? `Up to ${rule.config.limit ?? 28} words per sentence` : 'No all-capital phrases'}</p>;
    case 'ai_guideline': return <p className="text-xs text-ink-2">{rule.config.guidance}</p>;
  }
}

export default async function BrandPage() {
  const { ctx, actor } = await pageActor();
  const { workspace, rules, facts, rulesetHash } = await getBrand(ctx, actor);
  const on = rules.filter((r) => r.enabled).length;
  const admin = actor.role === 'admin';

  return (
    <Shell actor={actor}>
      <h1 className="text-3xl font-bold tracking-tight">Brand rules for {workspace.name}</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Every finding cites one of these rules and the passage of the brand guide it comes from. {on} of {rules.length} rules are on. Ruleset fingerprint <Hash value={rulesetHash} />
      </p>

      <div className="mt-8 space-y-10">
        {GROUPS.map((g) => {
          const list = rules.filter((r) => g.types.includes(r.type));
          if (!list.length) return null;
          return (
            <section key={g.title} aria-labelledby={`g-${g.title}`}>
              <h2 id={`g-${g.title}`} className="text-lg font-semibold">{g.title}</h2>
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
                {list.map((r) => (
                  <li key={r.id} className={`grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] ${r.enabled ? '' : 'opacity-55'}`}>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">{r.title}</h3><SeverityTag severity={r.severity} /><span className="text-xs text-ink-2">version {r.version}{r.enabled ? '' : ', off'}</span></div>
                      <p className="text-sm text-ink-2">{r.description}</p>
                      <Detail rule={r} />
                      <p className="border-l-2 border-line pl-3 font-serif text-sm leading-6">“{r.source.quote}” <span className="font-sans text-xs text-ink-2">{r.source.doc}</span></p>
                    </div>
                    {admin && <div className="sm:self-start"><RuleToggle id={r.id} enabled={r.enabled} /></div>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section aria-labelledby="facts-h">
          <h2 id="facts-h" className="text-lg font-semibold">Approved facts</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {facts.map((f) => (
              <li key={f.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{f.statement}</p>
                <p className="mt-1 border-l-2 border-line pl-3 font-serif leading-6">“{f.source.quote}” <span className="font-sans text-xs text-ink-2">{f.source.doc}</span></p>
              </li>
            ))}
          </ul>
        </section>

        {admin ? <AddRuleForm guideName={workspace.guideName} /> : <p className="text-sm text-ink-2">Only a brand admin can change these rules. Every change is recorded in the audit trail.</p>}
      </div>
    </Shell>
  );
}
