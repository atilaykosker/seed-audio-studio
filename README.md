# Seed Audio Studio

[![Live demo](https://img.shields.io/badge/demo-seed--audio--studio.vercel.app-000?logo=vercel)](https://seed-audio-studio.vercel.app)
[![CI](https://github.com/egebese/seed-audio-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/egebese/seed-audio-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/egebese/seed-audio-studio)

**▶ Live: https://seed-audio-studio.vercel.app**

Browser-based **BYOK** (bring-your-own-key) studio that turns a one-line brief into a
fully-structured, multi-voice **Seed Audio 1.0** generation — no backend.

A brief goes through a one-click pipeline:

1. **Plan** — fal's `openrouter/router` LLM categorizes the request (podcast / drama /
   narration / ad / cartoon …) and writes the proper seed-audio prompt(s) with SFX,
   atmosphere and music baked in, plus a character roster with voice specs. (System prompt =
   the Seed Audio Full Prompt Toolkit rules.)
2. **Mint voices** — each character's reference monologue is generated via seed-audio T2A,
   trimmed to ≤28s in-browser (WebAudio → WAV; the `audio_urls` cap is 30s), and uploaded to
   the fal CDN. Saved to a reusable **Voice Library** (localStorage).
3. **Generate** — each scene is rendered via seed-audio (T2A, or TA2A with `@Audio1..3`
   bound to the minted voices). Scenes with >3 speakers are split by the planner.

Everything runs client-side with the user's fal key. No server, no auth, static deploy.

## Stack
Vite + React 19 + TypeScript + Tailwind v4 + Radix UI + Zustand + `@fal-ai/client`.

## Develop
```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm typecheck
pnpm build      # static dist/
```

## Use
1. Click **Login with Fal key** (bottom-right), paste your `id:secret` key — stored only in
   this browser's localStorage, validated with a tiny test upload.
2. Type a brief, optionally set length / speakers / language / genre, hit **Generate**.
3. Audio clips stream in; play, download, or regenerate each. Minted voices persist in the
   Voice Library and are reused when a future scene needs the same character name.

## Endpoints
- `openrouter/router` — LLM planning (model picker in Settings)
- `bytedance/seed-audio-1.0` — audio (T2A / TA2A), `$0.1875/min`
- `fal.storage` — reference clip hosting

## Deploy
Static SPA. `pnpm build` → deploy `dist/` to Vercel (see `vercel.json` SPA rewrite).

## Notes / limits
- Reference clips ≤3 per scene, each ≤30s; prompts ≤2048 chars; output ≤2 min; EN/ZH.
- Out of scope (v1): scene images, karaoke/MP4 video, server-side rendering.

## Contributing
PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). `main` auto-deploys to production via
Vercel; pull requests get an automatic preview URL.

## License
[MIT](./LICENSE) © egebese
