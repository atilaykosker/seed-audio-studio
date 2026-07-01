# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install
pnpm dev          # Vite dev server → http://localhost:5173
pnpm build        # tsc -b (typecheck) then vite build → static dist/
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint .
pnpm test         # vitest (watch)
pnpm test:run     # vitest run (single pass, used in CI)
```

Vitest is wired up (jsdom env, globals enabled in `vite.config.ts`) but there are currently **no test files** in the repo. A single test runs with `pnpm vitest run path/to/file.test.ts` or `pnpm vitest run -t "name"`.

Path alias: `@/` → `src/` (defined in both `vite.config.ts` and `tsconfig.app.json`).

## Architecture

Browser-only **BYOK** (bring-your-own-key) SPA. There is no backend — everything runs client-side against the user's fal.ai key, stored in `localStorage`. Deploys as a static SPA (Vercel, with an SPA rewrite in `vercel.json`).

### The pipeline (the core of the app)

A one-line brief becomes multi-voice audio through a three-stage pipeline. Follow the data flow through these layers:

1. **Plan** — `src/services/studio/plan.ts`. `makePlan()` sends the brief + the Seed Audio system prompt (`src/services/studio/guide.ts`) to fal's `openrouter/router` LLM, which returns JSON describing a `category`, a `characters` roster (each with a `refPrompt` reference monologue + `voiceSpec`), and `scenes` (each `T2A` or `TA2A`, ≤3 speakers). `parsePlan()` tolerantly extracts JSON from prose/code-fences; `makePlan()` retries once with a stricter "JSON only" nudge on parse failure.
2. **Mint voices** — `src/services/studio/generate.ts` `mintVoice()`. Each character's `refPrompt` → seed-audio T2A → trimmed in-browser to ≤28s (`src/services/audio/trim.ts`, WebAudio decode → WAV; the model's `audio_urls` cap is 30s) → uploaded to the fal CDN. Minted voices are saved to a reusable **Voice Library** in `localStorage`.
3. **Generate** — `generateScene()`. Each scene renders via seed-audio. `TA2A` scenes bind the scene's speakers to reference URLs in order (`@Audio1..3`); a 422 "exceeds 30s" error triggers a re-trim to 27s and one retry. `generateFromPlan()` orchestrates the whole run: reuse library voices by name (case-insensitive), mint the missing ones, then generate scenes sequentially, reporting progress through a `GenerateCallbacks` object.

### State and orchestration

`src/store/useStore.ts` (Zustand) is the single source of truth and the seam between UI and services. `runStudio()` drives the full pipeline and translates the service-layer `GenerateCallbacks` into store updates (per-clip status, `currentStep` text, toasts). `regenScene()` re-runs a single scene. The store persists three things to `localStorage`: the fal key, the selected LLM model, and the voice library.

### fal integration

All fal.ai access goes through `src/services/fal/client.ts`:
- `configureFal()` / `isConfigured()` — sets the key on the singleton `fal` client.
- `run()` — generic `fal.subscribe` wrapper mapping queue status → `QueuePhase` (`queued`/`running`/`done`) progress callbacks.
- `llmText()` (via `openrouter/router`) and `seedAudio()` (`bytedance/seed-audio-1.0`) — the two model calls.
- `ENDPOINTS`, `MODELS`, `DEFAULT_MODEL` — endpoint ids and the LLM picker options.

`src/services/fal/keyStore.ts` handles key persistence and validation (a fal key is `<uuid>:<hex>`; validated by the cheapest authenticated call — a 1-byte upload to fal storage). `src/services/fal/errors.ts` `mapFalError()` translates any thrown fal error (`ApiError` status, `ValidationError`, network `TypeError`) into a user-facing `FriendlyError` — route all surfaced errors through it rather than showing raw messages.

### UI

`src/App.tsx` hydrates the stored key then renders `Studio` + `KeyBubble` (login) + `Toaster`. `src/screens/Studio.tsx` is the main screen; components live in `src/components/` and share primitives from `src/components/ui.tsx` (Radix + `class-variance-authority`, Tailwind v4). Shared types are in `src/lib/types.ts`; cost estimation for seed-audio ($0.1875/min) in `src/lib/cost.ts`.

## Constraints to respect

- seed-audio: reference clips ≤3 per scene, each ≤30s (trim to 28s minted / 27s on retry); prompts ≤2048 chars; output ≤2 min; languages EN/ZH only.
- When editing the system prompt in `guide.ts`, keep the strict JSON output contract intact — `parsePlan()` depends on the model returning a single JSON object with `characters` and `scenes` arrays.

## Design & plan docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` contain the original design spec and implementation plan — useful background for larger changes.
