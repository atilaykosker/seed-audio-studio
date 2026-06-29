# Seed Audio Studio Implementation Plan

> **For agentic workers:** Build task-by-task. Verification is `pnpm typecheck` + a manual dev smoke test (BYOK needs a real key). No auto-commits (user commits when ready).

**Goal:** Browser-based BYOK app that turns a brief into a fully-structured seed-audio multi-voice generation: LLM (openrouter/router) plans + categorizes + adds effects → auto-mints reference voices → generates audio. Static SPA.

**Architecture:** Mirror `seedance-prompter` exactly — Vite + React 19 + TS + Tailwind v4 + Radix + Zustand + `@fal-ai/client`, all client-side, static Vercel. Full-auto pipeline with live status + per-item regenerate.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind v4, Radix UI, Zustand, @fal-ai/client, pnpm.

---

## File map
- `package.json`, `vite.config.ts`, `tsconfig*.json`, `vercel.json`, `index.html`, `tailwind`(v4 via `@import` in css)
- `src/main.tsx`, `src/App.tsx`, `src/index.css`
- `src/lib/`: `types.ts`, `models.ts`, `utils.ts`, `cost.ts`, `validate.ts`
- `src/services/fal/`: `client.ts`, `keyStore.ts`, `errors.ts`
- `src/services/studio/`: `guide.ts`, `plan.ts`, `generate.ts`
- `src/services/audio/`: `trim.ts`, `concat.ts`
- `src/store/useStore.ts`
- `src/components/`: `ui.tsx`, `Toaster.tsx`, `KeyBubble.tsx`, `SettingsDialog.tsx`, `StudioScreen.tsx`, `BriefForm.tsx`, `PlanView.tsx`, `ClipCard.tsx`, `ResultsList.tsx`, `VoiceLibraryPanel.tsx`, `VoiceTile.tsx`

## Task 1 — Scaffold + config
Create Vite React-TS project files, install deps (`@fal-ai/client zustand @radix-ui/* lucide-react clsx tailwind-merge class-variance-authority` + dev `tailwindcss @tailwindcss/vite typescript vite @vitejs/plugin-react`). Tailwind v4 via `@tailwindcss/vite` plugin + `@import "tailwindcss";` in index.css. `vercel.json` SPA rewrite. Verify: `pnpm typecheck` + `pnpm dev` serves blank app.

## Task 2 — Types + models + utils + cost
`lib/types.ts`: `Voice {id,name,voiceSpec,url,durationSec,source:'minted'|'uploaded',createdAt}`, `Character {name,voiceSpec,refPrompt}`, `Scene {id,kind:'T2A'|'TA2A',title,speakers:string[],prompt}`, `Plan {category,characters:Character[],scenes:Scene[]}`, `Clip {id,sceneId,title,kind,prompt,url,durationSec,status,speakers}`, `Status`. `lib/models.ts`: MODELS array (ids above) + DEFAULT_MODEL. `lib/utils.ts`: `uid()`, `cn()`. `lib/cost.ts`: estimate ($0.075/min audio). Verify typecheck.

## Task 3 — fal services
`services/fal/client.ts`:
```ts
import { fal } from '@fal-ai/client'
let configured: string | null = null
export function configureFal(key: string){ if(key===configured) return; fal.config({credentials:key}); configured=key }
export const ENDPOINTS = { seedAudio:'bytedance/seed-audio-1.0', llm:'openrouter/router' } as const
export type Progress=(s:'queued'|'running'|'done',q?:number)=>void
export async function run<T>(endpoint:string, input:Record<string,unknown>, onProgress?:Progress){
  const res = await fal.subscribe(endpoint,{ input, logs:false, onQueueUpdate:(u:any)=>{
    if(u.status==='IN_QUEUE') onProgress?.('queued',u.queue_position)
    else if(u.status==='IN_PROGRESS') onProgress?.('running')
    else if(u.status==='COMPLETED') onProgress?.('done') }})
  return { data: res.data as T, requestId: res.requestId }
}
export async function uploadAsset(b:Blob){ return fal.storage.upload(b) }
```
`keyStore.ts`: localStorage `seed-audio-studio:key` get/store/clear + `validateKey(k)`= configureFal + `uploadAsset(tiny blob)`. `looksLikeKey` = `/^[^:]+:[^:]+/`.
`errors.ts`: `mapFalError(e)` → {title,message} (401/403 → bad key; 422 → validation; default → message).
Verify typecheck.

## Task 4 — Seed Audio guide (system prompt)
`services/studio/guide.ts`: export `SEED_AUDIO_GUIDE` (condensed toolkit Parts A–D: reference-clip rules, T2A vs TA2A formats, `Name (gender,age,accent,timbre,emotion,pace, voiced by @AudioN): "line"` tagging, concrete bracketed SFX/atmosphere/music, caps: prompt ≤2048, output ≤2min, refs ≤3×≤30s, EN/ZH, ≤3 distinct reference speakers per TA2A scene, ref monologue 55–70 words one-mood, no negations, accent explicit). Export `OUTPUT_DIRECTIVE` (strict JSON schema instruction). Verify typecheck.

## Task 5 — plan.ts
`buildPlanPrompt({idea,durationSec,language,speakers,genre})` → user message. `parsePlan(text)` → extract JSON (strip fences, find first `{`→last `}`), validate shape, throw on bad. `makePlan(args, model, onProgress)` → `run(ENDPOINTS.llm,{prompt,model,system_prompt:GUIDE+DIRECTIVE,temperature:0.7,max_tokens:2000})` → parse; retry once with stricter directive on parse fail. Verify typecheck.

## Task 6 — audio/trim.ts + concat.ts (WebAudio)
`trim.ts`: `trimTo(blob, maxSec=28)` → if duration≤max return blob; else decode via `AudioContext.decodeAudioData`, copy first max*sr samples into new buffer, encode WAV (standard 16-bit PCM WAV writer), return Blob. `fetchToBlob(url)`. `audioDuration(blob)`.
`concat.ts`: `concatWav(urls[])` → decode all, sum into one buffer (with 0.3s gap), WAV-encode. (Used optionally.)
Verify typecheck. Self-check: a `__main__`-style note is N/A in browser; rely on dev smoke.

## Task 7 — generate.ts (orchestration)
`generateFromPlan(plan, {library, model}, callbacks)`:
- For each character: if a library voice matches name → reuse url; else T2A `run(seedAudio,{prompt:refPrompt,sample_rate:44100})` → fetch result url → `trimTo(blob,28)` → `uploadAsset` → push Voice to library (callback) → map name→url.
- For each scene: build input. T2A → `{prompt,sample_rate:44100,output_format:'wav'}`. TA2A → add `audio_urls:[urls for speakers in order]`. `run(seedAudio,input)` → Clip{url,duration}. On 422 "30" → re-trim that speaker's ref and retry once.
- Emit per-step status via callbacks (planning/minting:name/generating:sceneId/done/error).
Verify typecheck.

## Task 8 — Zustand store
`store/useStore.ts`: state {key,keyDialogOpen,model,library:Voice[],brief,plan,clips:Clip[],status,error}; actions: setKey/clearKey, setModel, setBrief, addVoice/removeVoice (persist library+key to localStorage), `runStudio()` (calls makePlan then generateFromPlan, updates status/clips live), `regenScene(sceneId)`, reset. Hydrate key+library+model from localStorage on init. Verify typecheck.

## Task 9 — UI primitives + Toaster + KeyBubble + Settings
`ui.tsx`: Radix-wrapped Button, Input, Textarea, Select, Slider, Dialog, Label, Tooltip, Badge (cva styling, dark theme). `Toaster.tsx`: simple toast store + portal. `KeyBubble.tsx`: floating bubble; dialog with password input → `validateKey`→`storeKey`→`setKey`. `SettingsDialog.tsx`: model picker, clear results, forget key, clear library. Verify dev: bubble opens, key validates.

## Task 10 — StudioScreen + BriefForm + PlanView + Results + Voice Library
`BriefForm.tsx`: idea textarea + duration slider + language select + speakers select + genre input + Generate button (disabled w/o key) → `runStudio()`. `PlanView.tsx`: shows category badge, characters (minting status), scenes (generating status). `ClipCard.tsx`: `<audio controls>`, title, kind badge, speakers, collapsible prompt, download (a[href=url][download]), regenerate. `ResultsList.tsx`: grid of ClipCards. `VoiceLibraryPanel.tsx`+`VoiceTile.tsx`: list voices (preview audio, name, spec, delete) + "Upload voice" (file → `trimTo` → upload → addVoice). `StudioScreen.tsx`: layout (left: brief + library; right: plan + results). `App.tsx`: hydrate key on mount, render StudioScreen + KeyBubble + Toaster. Verify dev smoke (full flow with real key).

## Task 11 — polish + verify
Dark theme styling pass (match seedance-prompter aesthetic), empty states, cost estimate display, README with BYOK + deploy notes. Final: `pnpm typecheck` clean, `pnpm build` → `dist/`, dev smoke of: 2-speaker drama (~30s) end-to-end; 1-speaker T2A; 4-speaker (forces split); reuse + upload library voice.

## Verification (whole app)
1. `pnpm typecheck` — no errors.
2. `pnpm dev`, enter real fal key (validates), run a 2-speaker ~30s drama brief → plan parses, voices mint + appear in library, TA2A scene generates + plays + downloads.
3. `pnpm build` → static `dist/`.

## Self-review notes
- Spec coverage: BYOK (T3,T9), LLM plan/categorize/effects (T4,T5), mint+trim (T6,T7), generate T2A/TA2A+chunk/422-retry (T7), library+upload (T10), models (T2), cost (T2,T11), static deploy (T1). ✓
- 30s cap → trim.ts (T6) + 422 retry (T7). >3 speakers → LLM splits (T4 guide) + per-scene loop (T7). ✓
- Types consistent: Voice/Character/Scene/Plan/Clip defined T2, used T5/T7/T8/T10. ✓
