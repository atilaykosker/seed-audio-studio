# Seed Audio Studio — Design Spec (2026-06-26)

## Context
We built a successful seed-audio workflow (multi-voice dramatizations via `bytedance/seed-audio-1.0` using the official Full Prompt Toolkit: T2A scenes, TA2A reference-voice scenes, voice library). This productizes it as a **browser-based BYOK app** in the style of `seedance-prompter`: the user brings their own fal key, an LLM (fal's `openrouter/router`) categorizes the request and structures the seed-audio prompt with effects/atmosphere, and the app generates the audio — all client-side, static, no backend.

## Decisions (locked)
- **Scope:** Audio Studio only. No Ideogram images, no karaoke video/MP4 (those need a server). Pure static BYOK SPA.
- **Automation:** Full auto — one idea → LLM plans characters + scenes + effects → auto-mints reference voices → generates the multi-voice audio in one click. Plan is shown live; per-scene/voice regenerate is available.
- **Stack:** Identical to seedance-prompter — Vite + React 19 + TypeScript + Tailwind v4 + Radix UI + Zustand + `@fal-ai/client`. pnpm. Static build → Vercel (SPA rewrites). No server.

## Endpoints
- `openrouter/router` — LLM planning. Input: `prompt`, `model` (required, openrouter id), `system_prompt`, `temperature`, `max_tokens`, `reasoning`. Output: `output` (text).
- `bytedance/seed-audio-1.0` — audio. T2A: `prompt` (+ optional `voice`/`speed`/`pitch`). TA2A: `prompt` + `audio_urls` (≤3, each ≤30s) referenced as `@Audio1/2/3`. `sample_rate` 44100, `output_format` wav. Output: `audio.url`, `audio.duration`.
- `fal.storage.upload` — reference clip upload → CDN url.
- Caps to respect: prompt ≤2048 chars, output ≤2 min, refs ≤3 × ≤30s, EN/ZH.

## Pipeline (full auto)
1. **Brief** (StudioScreen): idea textarea + knobs: target duration, language (EN/ZH), #speakers (auto/1/2/3), optional genre hint, model picker. Optional: pin existing library voices to roles.
2. **① Plan** (`services/studio/plan.ts`): call `openrouter/router` with `system_prompt = SEED_AUDIO_GUIDE` (Parts A–D rules, condensed) + JSON output directive. Returns:
   ```
   { category, characters:[{name, voiceSpec, refPrompt}], scenes:[{kind:'T2A'|'TA2A', title, speakers:[name], prompt}] }
   ```
   LLM rules baked into system prompt: ref monologue ~55–70 words, one mood; every TA2A line tagged `Name (timbre/emotion, voiced by @AudioN): "..."`; SFX/atmosphere/music as concrete bracketed cues; **split scenes so each TA2A uses ≤3 distinct reference speakers**; keep each scene prompt ≤2000 chars and target ≤~90s.
3. **② Mint voices** (`generate.ts` + `audio/trim.ts`): for each character lacking a library voice → seed-audio T2A(`refPrompt`) → **WebAudio trim to ≤28s** (decode → slice → WAV encode; no ffmpeg in browser) → `fal.storage.upload` → save to Voice Library (localStorage meta + url). Reused library voices skip minting.
4. **③ Generate scenes**: T2A (no refs) or TA2A (`audio_urls` = speakers' ref urls in @Audio order). Multi-chunk scenes generated sequentially; optional WebAudio concat (`audio/concat.ts`) into one track per scene group.
5. **Results**: per scene/chunk → ClipCard (audio player, shown prompt, duration, download, regenerate).

## Architecture (mirrors seedance-prompter)
```
src/
  App.tsx, main.tsx, index.css
  store/useStore.ts            # key, model, library, plan, results, status, settings
  services/fal/
    client.ts                  # configureFal, run()=fal.subscribe w/ progress, uploadAsset, ENDPOINTS
    keyStore.ts                # localStorage 'seed-audio-studio:key' + validateKey (cheap test call)
    errors.ts                  # mapFalError
  services/studio/
    guide.ts                   # SEED_AUDIO_GUIDE system prompt (toolkit Parts A–D) + OUTPUT_DIRECTIVE
    plan.ts                    # buildPlanPrompt + callLLM + parsePlan (JSON)
    generate.ts                # orchestrate: mint refs -> generate scenes (+chunk handling)
  services/audio/
    trim.ts                    # WebAudio decode -> <=28s -> WAV blob
    concat.ts                  # WebAudio merge clips -> one WAV (optional)
  components/
    KeyBubble.tsx, SettingsDialog.tsx, StudioScreen.tsx, BriefForm.tsx,
    PlanView.tsx (live status), ResultsList.tsx, ClipCard.tsx,
    VoiceLibraryPanel.tsx, VoiceTile.tsx, ui.tsx, Toaster.tsx
  lib/
    types.ts, models.ts (openrouter ids), validate.ts, cost.ts, utils.ts
docs/ , vercel.json (SPA rewrites)
```

**Models** (`lib/models.ts`): `anthropic/claude-sonnet-4.5` (default), `anthropic/claude-3.7-sonnet`, `openai/gpt-5-chat`, `openai/gpt-4o`, `google/gemini-2.5-pro`, `deepseek/deepseek-v3.1-terminus`.

## State (Zustand)
`key`, `keyDialogOpen`, `model`, `library: Voice[]`, `plan: Plan|null`, `results: Clip[]`, `status` (idle/planning/minting/generating/done/error), per-item progress, `settings`.

## Error handling
- Bad key → KeyBubble error via `validateKey`.
- LLM JSON parse failure → retry once with a stricter directive, then surface.
- TA2A 422 "exceeds 30s" → auto re-trim the ref via WebAudio and retry.
- Content-checker false-flag → one retry.
- Each fal error mapped to a user-facing toast.

## Testing / verification
- `pnpm typecheck` clean.
- `pnpm dev` → enter a real fal key → run a small brief (2-speaker drama, ~30s) → confirm: plan JSON parses, voices mint + appear in library, TA2A scene generates and plays, download works.
- Edge: 1-speaker T2A brief; a 4-speaker brief (forces ≤3 split into 2 scenes); reuse a library voice.
- Build: `pnpm build` produces static `dist/`.

## Out of scope (v1)
Ideogram scene images, Remotion karaoke/MP4 export, server/Lambda, auth, multi-user, persistence beyond localStorage.
