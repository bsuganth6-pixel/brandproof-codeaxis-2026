#!/usr/bin/env node
// End-to-end check against a running deployment:  node scripts/smoke.mjs https://your-app.vercel.app
// Creates one review, runs the full approval workflow and verifies the guarantees. Needs DEMO_MODE on.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); if (!cond) failed++; };

async function session(role) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ role }) });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
}

const health = await (await fetch(`${base}/api/health`)).json();
console.log(`storage: ${health.storage} | model: ${health.llm.provider} (${health.llm.model})`);
ok('health endpoint is ok', health.ok === true);

const author = await session('author');
const approver = await session('approver');
const text = 'Our cold brew cures tiredness, guaranteed. 20% off today only, hurry! Founded in 2010.';
let r = (await author('POST', '/api/reviews', { title: `Smoke test ${new Date().toISOString()}`, channel: 'social', text })).json.review;
ok('draft created', r?.status === 'draft');
r = (await author('POST', `/api/reviews/${r.id}/analyze`)).json.review;
const crit = r.findings.filter((f) => f.severity === 'critical');
ok('analysis found critical findings with evidence', crit.length >= 2 && r.findings.every((f) => f.span && f.evidence.ruleSource.quote), `${r.findings.length} findings`);
ok('author cannot override a critical finding', (await author('POST', `/api/reviews/${r.id}/findings/${crit[0].id}`, { action: 'dismiss', reason: 'Trust me, this is fine' })).status === 403);
r = (await author('POST', `/api/reviews/${r.id}/transition`, { action: 'submit' })).json.review;
ok('submitted for approval', r?.status === 'in_review');
ok('approval blocked while criticals are open', (await approver('POST', `/api/reviews/${r.id}/transition`, { action: 'approve', rationale: 'Looks fine to me' })).json.error?.code === 'open_critical');
for (const f of crit) await approver('POST', `/api/reviews/${r.id}/findings/${f.id}`, { action: 'dismiss', reason: 'Legal reviewed this wording today.' });
ok('approval needs a rationale after overrides', (await approver('POST', `/api/reviews/${r.id}/transition`, { action: 'approve' })).json.error?.code === 'rationale_required');
r = (await approver('POST', `/api/reviews/${r.id}/transition`, { action: 'approve', rationale: 'Overrides recorded with legal sign-off.' })).json.review;
ok('approved by a different person', r?.status === 'approved' && r.decisions.at(-1).overrides.length === crit.length);
let view = (await approver('GET', `/api/reviews/${r.id}`)).json;
ok('approval is valid and audit chain is intact', view.approvalValid === true && view.chain.ok === true, `${view.chain.count} events`);
await author('PATCH', `/api/reviews/${r.id}`, { text: `${text} Edited after approval.` });
view = (await author('GET', `/api/reviews/${r.id}`)).json;
ok('editing the text invalidates the approval', view.approvalValid === false && view.review.status === 'draft');
ok('audit chain still intact', (await author('GET', '/api/audit/verify')).json.ok === true);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
