# Contributing to Seed Audio Studio

Thanks for your interest! This is a static, bring-your-own-key (BYOK) Vite + React app —
no backend, no server secrets. Contributions are welcome.

## Local setup

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Open the app, click **Login with Fal key** (bottom-right), and paste your own
[fal.ai API key](https://fal.ai/dashboard/keys). The key is stored only in your browser's
`localStorage` and is sent directly to fal — never to any server of ours.

## Before opening a PR

```bash
pnpm typecheck    # must pass
pnpm build        # must pass
```

CI runs both on every push and pull request.

## How it works (orientation)

- `src/services/fal/` — the `@fal-ai/client` wrapper, BYOK key store, error mapping.
- `src/services/studio/` — `guide.ts` (the LLM system prompt / Seed Audio toolkit rules),
  `plan.ts` (LLM planning via `openrouter/router`), `generate.ts` (mint voices → generate scenes).
- `src/services/audio/` — in-browser WebAudio trim/concat (the `audio_urls` cap is 30s).
- `src/store/useStore.ts` — Zustand state + the one-click pipeline.
- `src/components/` — UI, landing page (`Marketing.tsx`), examples (`Examples.tsx`).

## Guidelines

- Keep it **BYOK and static** — do not add a backend or commit any API key.
- Match the existing TypeScript + Tailwind style.
- Prefer small, focused PRs. Describe what you changed and why.
- Be respectful in issues and reviews.

## Deploys

`main` auto-deploys to production via Vercel's Git integration; pull requests get their own
preview URL automatically. You don't need to deploy manually.
