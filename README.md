# BrandProof

Evidence-backed, human-controlled brand governance. BrandProof checks copy against your **approved brand rules and facts** before it is published. Every finding quotes the draft and cites the passage of the brand guide it comes from, and a named person decides what ships. Approvals are bound to a hash of the exact text, so they cannot silently outlive an edit.

Built for CODEAXIS 2026 (Round 2). See [DISCLOSURES.md](DISCLOSURES.md) for AI use, templates and dependencies.

## Run it in 60 seconds

```bash
npm install
npm run dev          # http://localhost:3000
```

Open the app and pick a demo role (author, approver or admin). It runs with **no keys at all**: an in-memory store seeded with a fictional brand, and an offline keyword heuristic standing in for the model (labelled `mock-offline` everywhere it appears).

```bash
npm test             # 56 tests: engine, model-output guard, state machine, audit chain, workflow, metrics
npm run typecheck
node scripts/smoke.mjs http://localhost:3000   # end-to-end check of the approval guarantees
```

## Deploy (Vercel + MongoDB Atlas)

1. **Atlas**: create a free cluster, a database user, and under Network Access allow `0.0.0.0/0` (Vercel has no fixed IPs on the free plan). Copy the `mongodb+srv://...` connection string.
2. **Vercel**: import the GitHub repo and set these environment variables, then deploy.

| Variable | Needed | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | **Yes on Vercel** | Without it the app uses per-instance memory, which serverless does not share between requests |
| `SESSION_SECRET` | **Yes** | 32+ random characters (`openssl rand -base64 32`) that sign the session cookie |
| `ANTHROPIC_API_KEY` | Recommended | Real model analysis. Default model `claude-sonnet-5-5`, override with `LLM_MODEL` |
| `OPENAI_API_KEY`, `LLM_MODEL`, `OPENAI_BASE_URL` | Alternative | Any OpenAI-compatible API instead of Anthropic |
| `DEMO_MODE` | Optional | `true` (default) shows one-click demo sign-in. Set `false` for real use |
| `MONGODB_DB`, `DEMO_PASSWORD` | Optional | Database name (default `brandproof`), password of the seeded demo users |

3. Open `/api/health`. It must report `"storage":"mongodb"`, and the model you expect. Then run `node scripts/smoke.mjs https://your-app.vercel.app`.

The first request seeds the demo workspace (seven reviews, 14 rules, 3 facts, a verified audit chain). Seeding is idempotent.

## How a review flows

```
draft ─► rule engine (deterministic) ─┐
     └─► BM25 retrieval of relevant rules ─► model (Anthropic / OpenAI / offline mock)
                                              │
                         verification guard ◄─┘  rule id must be one we offered AND the quote must exist in the draft
                                │
                          merged findings, each with: verbatim span + brand-guide quote (+ approved fact)
                                │
         author fixes or dismisses with a reason ─► submit ─► approver decides (not the submitter)
                                │
         approval = person + SHA-256 of the text + fingerprint of the ruleset, sealed in a hash-chained audit log
```

**State machine** (`src/lib/core/statemachine.ts`): `draft → analyzed → in_review → approved | changes_requested | rejected`. Editing text from any state returns to `draft` and invalidates an approval. Roles: authors write and submit, approvers decide, admins manage rules. Nobody approves what they submitted, admins included. A critical finding can only be overridden by an approver, with a written reason, while the review awaits approval.

## The three measurable improvements

All three are computed live from stored data on the **Insights** page, with the formula beside each number.

| Improvement | Measured as |
| --- | --- |
| Evidence-backed explanations | Share of findings with a verified quote and a brand-guide source (100% by construction). Share of model suggestions dropped by the guard |
| Human accountability | Share of decisions bound to a named person, a content hash and a ruleset hash. Median time to decision. Critical-override rate, each with a reason |
| Governance insights | First-draft clean rate, issues removed before approval, findings per 100 words, rules that fire most |

## Layout

```
src/lib/core/        pure logic: engine, quotes, retrieval, ai guard, state machine, audit chain, metrics
src/lib/llm/         provider interface + Anthropic, OpenAI-compatible and offline mock adapters
src/lib/db/          repository interface + MongoDB and in-memory adapters
src/lib/services.ts  use-cases: create, analyze, decide findings, transition, rules, insights
src/lib/seed.ts      fictional "Kaveri Roasters" workspace, built by running the real services
src/app/             Next.js App Router pages and /api routes
tests/               Vitest suites
```

## Security and responsible AI

- **Auth**: scrypt-hashed passwords, HMAC-signed `HttpOnly`, `SameSite=Lax`, `Secure` (in production) session cookie, 8 hour lifetime. Every API route re-checks the user and workspace.
- **CSRF**: state-changing routes reject requests whose `Origin` does not match the host.
- **Limits**: Zod validation on every input, 20,000 character drafts, per-user rate limit on analysis (best effort per instance).
- **Model trust**: findings need a known rule id and a verbatim quote. Severity comes from the rule, never from the model. The draft is passed as delimited, untrusted data, and the model cannot change a review's status.
- **Failure mode**: if the model is slow or down, rule-based findings still return and the review page says so.
- **Privacy**: the audit log stores hashes, never draft text. Draft text is sent only to the model provider you configure.
- **Tamper evidence**: each audit event hashes the one before it. The UI and `/api/audit/verify` recompute the chain.
- **Concurrency**: reviews use optimistic versioning, audit events use unique sequence numbers with retry.

## Known limits

- The **MongoDB adapter has not been run against a live Atlas cluster** in the environment this was built in (no network access to Atlas). It uses only basic driver calls and shares an interface with the in-memory adapter that the test suite exercises. Run `scripts/smoke.mjs` against your deployment first.
- Fact and required-wording rules are regular expressions written by hand for the demo brand. They are admin-controlled and length-capped, but a production system would need review tooling for them. The admin screen creates terminology rules only.
- The rate limiter is per server instance. There is no password reset, user management or SSO (out of scope for the MVP).
- Rules and the offline heuristic are English only.

## Three-minute demo

1. Sign in as **Arun (author)**, open *Weekend flash sale post*. Point at the proof sheet: three inks, one per severity, 15 findings. Click a highlight, read the **Evidence** (brand-guide quote, approved fact). Press *Replace with "Founded in 2012"*.
2. Press *Submit for approval*. Sign out, sign in as **Meera (approver)**. *Approve* is blocked: critical findings are still open. Override each with a reason, then approve with a rationale.
3. Open the **approval certificate**: fingerprints, overrides, audit status. Press *Recompute the fingerprint in this browser*.
4. Back as Arun, edit one word of the approved text. The approval is invalidated and the review returns to draft.
5. Open **Insights**: every number comes with its formula.
