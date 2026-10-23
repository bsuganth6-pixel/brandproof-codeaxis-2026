# Disclosures (CODEAXIS 2026, Round 2)

Event rules ask for AI use, templates and reused code to be disclosed. This is the complete list.

## AI assistance
- The code, tests and documentation in this repository were written with **Anthropic Claude** in a chat session, under the direction of the team leader (Suganth B, team BSUGANTH6). The team leader chose the problem framing, scope, stack and design direction, ran the build and is responsible for what is submitted.
- BrandProof itself can call a language model at runtime (Anthropic or an OpenAI-compatible API, chosen by environment variables). Without an API key it uses a clearly labelled offline keyword heuristic (`mock-offline`). Model output is never trusted directly: every model finding must cite a known rule and quote text that exists in the draft, or it is dropped (`src/lib/core/ai.ts`).

## Templates and starter code
- No template or starter kit was used. The project was scaffolded by hand in the standard Next.js App Router layout. There is no code copied from earlier projects.

## Open-source dependencies
Next.js, React, Tailwind CSS (with `@tailwindcss/postcss`), PostCSS, TypeScript, Zod, the official MongoDB Node.js driver, Vitest. Fonts (Bricolage Grotesque, Source Serif 4) load from Google Fonts at runtime; the app falls back to system fonts if they cannot load.

## Data
- "Kaveri Roasters", its brand guide, fact sheet, users and every review in the demo workspace are **fictional and synthetic**, written for this project. No real brand, person or customer data is included.
- The demo accounts and the default demo password exist for judging only. Set `DEMO_MODE=false` and a `SESSION_SECRET` for any real use.

## Build timeline
- Everything in this repository was built for Round 2, starting on 22 October 2026. Keep the Git history intact so commit times show this.
