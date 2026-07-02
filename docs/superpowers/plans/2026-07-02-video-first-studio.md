# Video-First Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the studio from an audio+lip-sync pipeline to a video-first one: each scene becomes a ≤8s shot rendered by a user-selectable video model (Veo 3.1 / Seedance 2.0 / kling), with native audio coming from the model itself.

**Architecture:** Keep the plan → character-image → scene-keyframe → video flow. Delete the seed-audio voice-minting, per-scene audio, LatentSync lip-sync, and ffmpeg-mux layers. A `VIDEO_MODELS` registry + a generic `nativeVideo()` dispatcher replaces `klingVideo`. The store gains a persisted `videoModel` selection.

**Tech Stack:** TypeScript, React 19, Zustand, Vite, Vitest (jsdom), Tailwind v4 + Radix, fal.ai client (BYOK).

## Global Constraints

- Video models cap generation at ≤8s per clip (kling: ≤15s); `durationSec` clamps to the selected model's `maxDurationSec`. Planning targets ≤8s shots.
- Native audio: Veo 3.1, Veo 3.1 Fast, Seedance 2.0, Seedance 2.0 Fast produce audio; kling v3 is silent (`audio: false`).
- Path alias `@/` → `src/`. Run a single test file with `pnpm vitest run <path>`; typecheck with `pnpm typecheck`.
- All surfaced fal errors go through `mapFalError()` (unchanged).
- Language remains EN/ZH (planning-only; video models accept both).
- fal endpoint field names (`image_url` vs `start_image_url`, `duration` format, `resolution`, `aspect_ratio`, `generate_audio`) MUST be confirmed against each model's fal API page during Task 1 — the code below uses the best-known names and is isolated in one per-model mapper so a correction touches one place.

---

### Task 1: fal client — VIDEO_MODELS registry + `nativeVideo`; remove audio/lipsync endpoints

**Files:**
- Modify: `src/services/fal/client.ts`
- Test: `src/services/fal/client.test.ts`

**Interfaces:**
- Produces: `VideoModelId` (union of 5 endpoint ids), `VideoModel` interface, `VIDEO_MODELS: VideoModel[]`, `DEFAULT_VIDEO_MODEL: VideoModelId`, `getVideoModel(id): VideoModel`, `buildVideoInput(model, args): Record<string,unknown>`, `nativeVideo(args, opts): Promise<{ url: string }>`.
- Removes: `seedAudio`, `SeedAudioOutput`, `SEED_AUDIO_MAX_PROMPT`, `clampPrompt`, `latentSync`, `mergeAudioVideo`, `klingVideo`, `KlingElement`, `stripInvalidElementRefs`, and the `seedAudio`/`latentSync`/`mergeAudioVideo`/`klingVideo` `ENDPOINTS` entries.
- Keeps: `run`, `TIMEOUTS` (rename `seedAudio` key away — see step), `uploadAsset`, `nanoBanana`, `llmText`, LLM `MODELS`.

- [ ] **Step 1: Write failing tests for the registry + input builder**

Add to `src/services/fal/client.test.ts` (create the file if the existing one has no room; otherwise append). Import the new symbols:

```ts
import { describe, it, expect } from 'vitest'
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL, getVideoModel, buildVideoInput } from './client'

describe('VIDEO_MODELS', () => {
  it('has the five expected tiers with positive prices and durations', () => {
    const ids = VIDEO_MODELS.map((m) => m.id)
    expect(ids).toEqual([
      'fal-ai/veo3.1/image-to-video',
      'fal-ai/veo3.1/fast/image-to-video',
      'bytedance/seedance-2.0/image-to-video',
      'bytedance/seedance-2.0/fast/image-to-video',
      'fal-ai/kling-video/v3/pro/image-to-video',
    ])
    for (const m of VIDEO_MODELS) {
      expect(m.pricePerSec).toBeGreaterThan(0)
      expect(m.maxDurationSec).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  it('marks veo + seedance as audio and kling as silent', () => {
    expect(getVideoModel('fal-ai/veo3.1/image-to-video').audio).toBe(true)
    expect(getVideoModel('bytedance/seedance-2.0/fast/image-to-video').audio).toBe(true)
    expect(getVideoModel('fal-ai/kling-video/v3/pro/image-to-video').audio).toBe(false)
  })

  it('DEFAULT_VIDEO_MODEL is a known id', () => {
    expect(VIDEO_MODELS.some((m) => m.id === DEFAULT_VIDEO_MODEL)).toBe(true)
  })
})

describe('buildVideoInput', () => {
  const seedance = getVideoModel('bytedance/seedance-2.0/image-to-video')
  const kling = getVideoModel('fal-ai/kling-video/v3/pro/image-to-video')

  it('clamps duration to the model max and passes the start image + prompt', () => {
    const input = buildVideoInput(seedance, { prompt: 'hi', startImageUrl: 'u', durationSec: 999, aspect: 'landscape' })
    expect(input.prompt).toBe('hi')
    expect(input.image_url).toBe('u')
    expect(Number(input.duration)).toBeLessThanOrEqual(seedance.maxDurationSec)
  })

  it('requests audio only for audio-capable models', () => {
    expect(buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u' }).generate_audio).toBe(true)
    expect(buildVideoInput(kling, { prompt: 'p', startImageUrl: 'u' }).generate_audio).toBe(false)
  })

  it('maps portrait/landscape to the model aspect value', () => {
    const l = buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u', aspect: 'landscape' })
    const p = buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u', aspect: 'portrait' })
    expect(l.aspect_ratio).toBe(seedance.aspectRatios.landscape)
    expect(p.aspect_ratio).toBe(seedance.aspectRatios.portrait)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: FAIL — `VIDEO_MODELS`, `getVideoModel`, `buildVideoInput` are not exported.

- [ ] **Step 3: Confirm fal field names, then implement the registry + dispatcher**

First open each model's fal API page and confirm the input field names/format (see Global Constraints). Then, in `src/services/fal/client.ts`:

Replace the `ENDPOINTS` block's video/audio entries so it reads:

```ts
export const ENDPOINTS = {
  /** fal's OpenRouter gateway for LLM planning/categorization. */
  llm: 'openrouter/router',
  /** Text-to-image for character references / scene keyframes. */
  nanoBanana: 'fal-ai/nano-banana',
  /** Image-conditioned edit variant (compose characters into a keyframe). */
  nanoBananaEdit: 'fal-ai/nano-banana/edit',
} as const
```

In `TIMEOUTS`, remove the `seedAudio` key (keep `llm`, `image`, `video`).

Delete these exports entirely: `SeedAudioOutput`, `SEED_AUDIO_MAX_PROMPT`, `clampPrompt`, `seedAudio`, `KlingElement`, `KlingVideoOutput`, `stripInvalidElementRefs`, `klingVideo`, `LatentSyncOutput`, `latentSync`, `MergeAudioVideoOutput`, `mergeAudioVideo`.

Add the registry + dispatcher (place after `nanoBanana`):

```ts
export type VideoModelId =
  | 'fal-ai/veo3.1/image-to-video'
  | 'fal-ai/veo3.1/fast/image-to-video'
  | 'bytedance/seedance-2.0/image-to-video'
  | 'bytedance/seedance-2.0/fast/image-to-video'
  | 'fal-ai/kling-video/v3/pro/image-to-video'

export interface VideoModel {
  id: VideoModelId
  label: string
  /** One-line tradeoff shown in the picker. */
  description: string
  /** USD per second of generated video (720p). */
  pricePerSec: number
  maxDurationSec: number
  /** Whether the model generates native audio (dialogue/SFX). */
  audio: boolean
  /** Model-specific aspect_ratio values. */
  aspectRatios: { landscape: string; portrait: string }
}

const LANDSCAPE = '16:9'
const PORTRAIT = '9:16'

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'fal-ai/veo3.1/image-to-video',
    label: 'Veo 3.1',
    description: 'Highest quality dialogue + lip-sync. Priciest.',
    pricePerSec: 0.4,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'fal-ai/veo3.1/fast/image-to-video',
    label: 'Veo 3.1 Fast',
    description: 'Veo audio quality, faster and cheaper.',
    pricePerSec: 0.25,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'bytedance/seedance-2.0/image-to-video',
    label: 'Seedance 2.0',
    description: 'Balanced quality + native audio, keeps the input image.',
    pricePerSec: 0.3,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'bytedance/seedance-2.0/fast/image-to-video',
    label: 'Seedance 2.0 Fast',
    description: 'Cheapest with audio. Fast turnaround.',
    pricePerSec: 0.24,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    label: 'Kling v3 Pro (silent)',
    description: 'Longer clips (≤15s), strong motion — no audio.',
    pricePerSec: 0.1,
    maxDurationSec: 15,
    audio: false,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
]

export const DEFAULT_VIDEO_MODEL: VideoModelId = 'bytedance/seedance-2.0/image-to-video'

export function getVideoModel(id: string): VideoModel {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
}

export interface NativeVideoArgs {
  model: VideoModelId
  prompt: string
  startImageUrl: string
  durationSec?: number
  aspect?: 'landscape' | 'portrait'
}

/**
 * Build the fal input for one video model. Kling uses `start_image_url` + string duration;
 * Veo/Seedance use `image_url` + numeric seconds. Confirm field names against fal docs.
 */
export function buildVideoInput(model: VideoModel, args: Omit<NativeVideoArgs, 'model'>): Record<string, unknown> {
  const seconds = Math.min(model.maxDurationSec, Math.max(3, Math.round(args.durationSec ?? 8)))
  const aspect = model.aspectRatios[args.aspect ?? 'landscape']
  if (model.id === 'fal-ai/kling-video/v3/pro/image-to-video') {
    return {
      prompt: args.prompt,
      start_image_url: args.startImageUrl,
      duration: String(seconds),
      aspect_ratio: aspect,
      generate_audio: false,
    }
  }
  return {
    prompt: args.prompt,
    image_url: args.startImageUrl,
    duration: seconds,
    aspect_ratio: aspect,
    resolution: '720p',
    generate_audio: model.audio,
  }
}

interface VideoOutput {
  video: { url: string; content_type?: string; file_name?: string; file_size?: number }
}

/** Generate one image-to-video clip on the selected model. Audio embedded when the model supports it. */
export async function nativeVideo(args: NativeVideoArgs, opts: RunOptions = {}): Promise<{ url: string }> {
  const model = getVideoModel(args.model)
  const input = buildVideoInput(model, args)
  const { data } = await run<VideoOutput>(model.id, input, { timeoutMs: TIMEOUTS.video, ...opts })
  return { url: data.video.url }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: PASS. (If the existing test file referenced the removed `seedAudio`/`klingVideo`/`clampPrompt`, delete those obsolete tests in this step.)

- [ ] **Step 5: Commit**

```bash
git add src/services/fal/client.ts src/services/fal/client.test.ts
git commit -m "feat(fal): VIDEO_MODELS registry + nativeVideo; drop seed-audio/lipsync/kling fns"
```

---

### Task 2: types — video-first Character / Scene / Clip / Brief / Session

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: revised `Character { name, appearance, voice }`, `Scene { id, title, speakers, visual, dialogue }`, `Clip` (video-only fields), `Brief { idea, durationSec, language, speakers, genre, aspect }`, `Session { ..., videoModel }`, `ClipStatus = 'pending'|'running'|'done'|'error'`.
- Removes: `Voice` interface, `Scene.kind`, `Scene.prompt`, `Clip` audio/lipsync fields, `Brief.voiceIds`, `Brief.withVideo`.
- Keeps: `CharacterImage`, `Plan`, `StudioStatus`.

- [ ] **Step 1: Rewrite the type definitions**

Replace the full contents of `src/lib/types.ts` with:

```ts
/** A reusable character reference image, hosted on the fal CDN. */
export interface CharacterImage {
  id: string
  name: string
  url: string
  source: 'minted' | 'uploaded'
  createdAt: number
}

/** A character the LLM plans for the story. */
export interface Character {
  name: string
  /** Visual description for the character reference image (age, build, hair, clothing, art style). */
  appearance: string
  /** Short voice description embedded in each shot prompt for audio-capable models (best-effort consistency). */
  voice: string
}

/** One generatable unit: a single ≤8s video shot. */
export interface Scene {
  id: string
  title: string
  /** Character names on screen / speaking in this shot (≤3), in @Element / dialogue order. */
  speakers: string[]
  /** Shot description: setting, framing, camera move, lighting, action. */
  visual: string
  /** Spoken lines for this shot; empty for a silent/atmospheric shot. */
  dialogue: string
}

export interface Plan {
  category: string
  characters: Character[]
  scenes: Scene[]
}

export type ClipStatus = 'pending' | 'running' | 'done' | 'error'

/** A generated shot, one per scene: a video clip (with embedded audio when the model supports it). */
export interface Clip {
  id: string
  sceneId: string
  title: string
  speakers: string[]
  /** Composed prompt sent to the video model (for display). */
  prompt: string
  /** Scene keyframe used as the i2v start frame. */
  imageUrl?: string
  /** Final video clip URL. */
  videoUrl?: string
  durationSec?: number
  status: ClipStatus
  phase?: 'queued' | 'running' | 'done'
  error?: string
}

export type StudioStatus = 'idle' | 'planning' | 'generating' | 'done' | 'error'

export interface Brief {
  idea: string
  durationSec: number
  language: 'EN' | 'ZH'
  speakers: 'auto' | 1 | 2 | 3
  genre: string
  /** Video output orientation. */
  aspect: 'landscape' | 'portrait'
}

/** A saved run: brief + plan + results, persisted in localStorage and listed in the sidebar. */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  brief: Brief
  plan: Plan | null
  category: string | null
  clips: Clip[]
  /** Video model id used for this run. */
  videoModel: string
}
```

- [ ] **Step 2: Verify the type errors surface where consumers must change**

Run: `pnpm typecheck`
Expected: FAIL with errors in `plan.ts`, `guide.ts`, `generate.ts`, `video.ts`, `image.ts`, `cost.ts`, `useStore.ts`, and UI components — these are fixed by the following tasks. This step just confirms the new shapes compile in isolation (no errors *inside* `types.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor(types): video-first Character/Scene/Clip/Brief/Session; drop Voice + audio fields"
```

---

### Task 3: guide + plan — video-director system prompt and parser

**Files:**
- Modify: `src/services/studio/guide.ts`
- Modify: `src/services/studio/plan.ts`
- Test: `src/services/studio/plan.test.ts`

**Interfaces:**
- Consumes: `Character`, `Scene`, `Plan`, `Brief` (Task 2).
- Produces: `SEED_AUDIO_GUIDE` → renamed `DIRECTOR_GUIDE`, `OUTPUT_DIRECTIVE` (new schema); `buildPlanPrompt(b: Brief): string` (drops `provided`), `parsePlan(text): Plan`, `makePlan(brief, model, opts?): Promise<Plan>` (drops `provided`). `VIDEO_DIRECTIVE` removed.

- [ ] **Step 1: Write the failing parser test**

Replace `src/services/studio/plan.test.ts` body with (keep any existing imports style):

```ts
import { describe, it, expect } from 'vitest'
import { parsePlan, buildPlanPrompt } from './plan'
import type { Brief } from '@/lib/types'

const RAW = JSON.stringify({
  category: 'Cartoon',
  characters: [
    { name: 'Rio', appearance: 'young girl, red hoodie, cartoon style', voice: 'bright high energetic' },
    { name: 'Bo', appearance: 'blue robot, round eyes', voice: 'deep calm synthetic' },
  ],
  scenes: [
    { title: 'Meet', speakers: ['Rio', 'Bo'], visual: 'Rio waves at Bo in a sunny park, wide shot', dialogue: 'Rio: "Hi Bo!" Bo: "Hello Rio."' },
    { title: 'Sky', speakers: [], visual: 'Clouds drift over the park, no characters', dialogue: '' },
  ],
})

describe('parsePlan', () => {
  it('parses characters (appearance+voice) and scenes (visual+dialogue)', () => {
    const p = parsePlan('```json\n' + RAW + '\n```')
    expect(p.category).toBe('Cartoon')
    expect(p.characters.map((c) => c.name)).toEqual(['Rio', 'Bo'])
    expect(p.characters[0].appearance).toContain('hoodie')
    expect(p.characters[0].voice).toBe('bright high energetic')
    expect(p.scenes).toHaveLength(2)
    expect(p.scenes[0].speakers).toEqual(['Rio', 'Bo'])
    expect(p.scenes[0].visual).toContain('park')
    expect(p.scenes[0].dialogue).toContain('Hi Bo')
    expect(p.scenes[1].dialogue).toBe('')
    expect(p.scenes[0].id).toBeTruthy()
  })

  it('drops characters without a name and caps speakers at 3', () => {
    const raw = JSON.stringify({
      characters: [{ appearance: 'x', voice: 'y' }, { name: 'A', appearance: 'a', voice: 'v' }],
      scenes: [{ title: 'S', speakers: ['A', 'B', 'C', 'D'], visual: 'v', dialogue: 'd' }],
    })
    const p = parsePlan(raw)
    expect(p.characters.map((c) => c.name)).toEqual(['A'])
    expect(p.scenes[0].speakers).toHaveLength(3)
  })

  it('throws when scenes are missing', () => {
    expect(() => parsePlan(JSON.stringify({ characters: [] }))).toThrow()
  })
})

describe('buildPlanPrompt', () => {
  it('includes the idea, target length and aspect', () => {
    const b: Brief = { idea: 'a fox finds a lamp', durationSec: 24, language: 'EN', speakers: 'auto', genre: '', aspect: 'portrait' }
    const out = buildPlanPrompt(b)
    expect(out).toContain('a fox finds a lamp')
    expect(out).toContain('24')
    expect(out.toLowerCase()).toContain('portrait')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/studio/plan.test.ts`
Expected: FAIL — parser still expects `refPrompt`/`kind`/`prompt`; `buildPlanPrompt` signature mismatch.

- [ ] **Step 3: Rewrite `guide.ts`**

Replace the full contents of `src/services/studio/guide.ts` with:

```ts
/**
 * System prompt: a video-director guide. The LLM turns a brief into a plan of short
 * (≤8s) shots, each rendered by an image-to-video model whose audio is native.
 */
export const DIRECTOR_GUIDE = `You are a senior director for short AI-generated video. You turn a user's brief into a production-ready plan of SHOTS. Each shot is rendered by an image-to-video model that also generates its own audio (dialogue, ambience, SFX) in a single pass.

# Shots
- A "scene" is ONE shot: a single continuous ≤8 second clip. Never write a long multi-part scene — SPLIT a story into a sequence of short shots that read in order.
- Prefer 2-6 shots for a short piece. Give each beat its own shot.

# For each shot provide
- "visual": a concrete shot description — setting, framing, camera move, lighting, action. This drives the image-to-video generation.
- "dialogue": the exact spoken lines for this shot, written as \`Name: "Line."\` (one or more speakers). Leave EMPTY for a silent/atmospheric shot. The model speaks these lines with lip-sync.
- "speakers": the character names that appear on screen / speak in this shot, in order (AT MOST 3).

# Characters
- For EACH character give an "appearance": a concise, consistent visual description (age, build, hair, clothing, distinctive features, art style) used to mint one reference image reused across every shot.
- For EACH character give a "voice": a short voice description (gender, age, accent, timbre, energy). This is embedded in every shot's prompt so the same character sounds consistent across shots (best-effort — the model cannot pin an exact voice).

# Verbatim dialogue (HIGHEST PRIORITY)
If the brief ALREADY contains dialogue — lines as \`Name: "..."\` or quoted speech attributed to a speaker — reproduce every quoted line EXACTLY, word for word. Do not add, remove, rephrase, expand, shorten, or reorder words inside the quotes, and do not invent extra lines. You may still derive the roster, add appearance/voice, split into shots, and set the visual around the lines.

# Categorization
Pick one category that best fits: Cartoon, Advertisement, Short Film, Music Video, Explainer, Comedy Sketch, Sci-Fi Scene, Documentary, Trailer, or Other. Use it to choose tone, pacing, lighting and sound.

# Craft
- Write real, vivid shots: purposeful camera, clear action, concrete lighting. Vague cues get vague video.
- Reuse the same characters across shots so their reference image and voice carry through.
- Keep dialogue tight — a ≤8s shot fits roughly 1-3 short lines.`

/** Strict JSON output contract appended to the system prompt. Matches the Plan type. */
export const OUTPUT_DIRECTIVE = `

# OUTPUT
Return ONLY a single JSON object, no markdown fences, no commentary. Schema:
{
  "category": string,
  "characters": [ { "name": string, "appearance": string, "voice": string } ],
  "scenes": [ { "title": string, "speakers": [string], "visual": string, "dialogue": string } ]
}
Rules:
- "name" values in scene.speakers MUST exactly match characters[].name.
- Keep each shot ≤8 seconds; SPLIT longer beats into more shots.
- At most 3 speakers per shot. "dialogue" may be an empty string for a silent shot.`
```

- [ ] **Step 4: Rewrite `plan.ts`**

Replace the full contents of `src/services/studio/plan.ts` with:

```ts
import { llmText, type RunOptions } from '@/services/fal/client'
import type { Brief, Plan, Scene } from '@/lib/types'
import { uid } from '@/lib/utils'
import { DIRECTOR_GUIDE, OUTPUT_DIRECTIVE } from './guide'

export function buildPlanPrompt(b: Brief): string {
  const speakers =
    b.speakers === 'auto'
      ? 'Choose a sensible number of distinct characters.'
      : `Use about ${b.speakers} distinct character(s).`
  const genre = b.genre.trim() ? `Genre/style hint: ${b.genre.trim()}.` : ''
  return [
    `Brief: ${b.idea.trim()}`,
    `Target total length: about ${b.durationSec} seconds (split into ≤8s shots).`,
    `Language for spoken dialogue: ${b.language === 'ZH' ? 'Chinese' : 'English'}.`,
    `Orientation: ${b.aspect === 'portrait' ? 'portrait (9:16)' : 'landscape (16:9)'}.`,
    speakers,
    genre,
    `Plan the characters and the shots needed to realize this, following all the rules. Categorize it.`,
  ]
    .filter(Boolean)
    .join('\n')
}

interface RawPlan {
  category?: string
  characters?: { name?: string; appearance?: string; voice?: string }[]
  scenes?: { title?: string; speakers?: string[]; visual?: string; dialogue?: string }[]
}

/** Pull the first balanced JSON object out of an LLM response (tolerates fences/prose). */
function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in LLM output.')
  return t.slice(start, end + 1)
}

export function parsePlan(text: string): Plan {
  const raw = JSON.parse(extractJson(text)) as RawPlan
  if (!Array.isArray(raw.characters) || !Array.isArray(raw.scenes)) {
    throw new Error('LLM plan missing characters/scenes.')
  }
  const characters = raw.characters
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name!.trim(),
      appearance: (c.appearance ?? '').trim(),
      voice: (c.voice ?? '').trim(),
    }))
  const scenes: Scene[] = raw.scenes
    .filter((s) => s.visual || s.dialogue)
    .map((s) => ({
      id: uid(),
      title: (s.title ?? 'Shot').trim(),
      speakers: (s.speakers ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
      visual: (s.visual ?? '').trim(),
      dialogue: (s.dialogue ?? '').trim(),
    }))
  if (!scenes.length) throw new Error('LLM plan has no scenes.')
  return { category: (raw.category ?? 'Other').trim(), characters, scenes }
}

/** Call the LLM and parse a Plan. Retries once with a stricter nudge on parse failure. */
export async function makePlan(brief: Brief, model: string, opts: RunOptions = {}): Promise<Plan> {
  const userPrompt = buildPlanPrompt(brief)
  const systemBase = DIRECTOR_GUIDE + OUTPUT_DIRECTIVE
  const attempt = async (extra = '') =>
    parsePlan(
      await llmText(
        { systemPrompt: systemBase + extra, prompt: userPrompt, model, temperature: 0.7, maxTokens: 3500 },
        opts,
      ),
    )
  try {
    return await attempt()
  } catch {
    return await attempt('\n\nIMPORTANT: Output MUST be valid JSON only — no prose, no code fences.')
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/plan.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/studio/guide.ts src/services/studio/plan.ts src/services/studio/plan.test.ts
git commit -m "feat(plan): video-director guide + parser (appearance/voice, visual/dialogue shots)"
```

---

### Task 4: image — build prompts from the new character/scene fields

**Files:**
- Modify: `src/services/studio/image.ts`
- Test: `src/services/studio/image.test.ts`

**Interfaces:**
- Consumes: `Character`, `Scene`, `CharacterImage` (Task 2).
- Produces (unchanged signatures): `buildCharacterImagePrompt(c): string`, `buildKeyframePrompt(s, aspect?): string`, `mintCharacterImage(c): Promise<CharacterImage>`, `sceneKeyframe(scene, presentImageUrls, aspect?): Promise<string>`.

- [ ] **Step 1: Update the failing test**

Replace `src/services/studio/image.test.ts` body with:

```ts
import { describe, it, expect } from 'vitest'
import { buildCharacterImagePrompt, buildKeyframePrompt } from './image'
import type { Character, Scene } from '@/lib/types'

describe('image prompts', () => {
  it('uses appearance for the character portrait', () => {
    const c: Character = { name: 'Rio', appearance: 'young girl in a red hoodie', voice: 'bright' }
    expect(buildCharacterImagePrompt(c)).toContain('young girl in a red hoodie')
    expect(buildCharacterImagePrompt(c)).toContain('Rio')
  })

  it('uses the scene visual for the keyframe and reflects orientation', () => {
    const s: Scene = { id: '1', title: 'Meet', speakers: [], visual: 'sunny park wide shot', dialogue: '' }
    expect(buildKeyframePrompt(s, 'portrait')).toContain('sunny park wide shot')
    expect(buildKeyframePrompt(s, 'portrait')).toContain('9:16')
    expect(buildKeyframePrompt(s, 'landscape')).toContain('16:9')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/studio/image.test.ts`
Expected: FAIL — `buildCharacterImagePrompt` reads `c.voiceSpec`; `buildKeyframePrompt` takes no aspect.

- [ ] **Step 3: Rewrite `image.ts`**

Replace the full contents of `src/services/studio/image.ts` with:

```ts
import { nanoBanana } from '@/services/fal/client'
import { uid } from '@/lib/utils'
import type { Character, CharacterImage, Scene } from '@/lib/types'

/** Prompt for a single-character reference image (reused across every shot). */
export function buildCharacterImagePrompt(c: Character): string {
  const look = c.appearance.trim() || 'a distinctive character'
  return `Character reference portrait of ${c.name}: ${look}. Centered, clear face, neutral plain background, consistent art style, full head-and-shoulders framing.`
}

/** Prompt for a shot establishing image used as the i2v start frame. */
export function buildKeyframePrompt(s: Scene, aspect: 'landscape' | 'portrait' = 'landscape'): string {
  const ratio = aspect === 'portrait' ? '9:16' : '16:9'
  const shot = s.visual.trim() || s.title
  return `Cinematic establishing frame, ${ratio}. ${shot}. Cohesive lighting and composition, no text or watermark.`
}

/** Mint one character's reference image via nano-banana (text-to-image, 1:1). */
export async function mintCharacterImage(c: Character): Promise<CharacterImage> {
  const { url } = await nanoBanana({ prompt: buildCharacterImagePrompt(c), aspectRatio: '1:1' })
  return { id: uid(), name: c.name, url, source: 'minted', createdAt: Date.now() }
}

/** Generate a shot keyframe. When characters are present, condition on their images (edit). */
export async function sceneKeyframe(
  scene: Scene,
  presentImageUrls: string[],
  aspect: 'landscape' | 'portrait' = 'landscape',
): Promise<string> {
  const { url } = await nanoBanana({
    prompt: buildKeyframePrompt(scene, aspect),
    aspectRatio: aspect === 'portrait' ? '9:16' : '16:9',
    ...(presentImageUrls.length ? { imageUrls: presentImageUrls } : {}),
  })
  return url
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/studio/image.ts src/services/studio/image.test.ts
git commit -m "refactor(image): prompts from appearance/visual + orientation-aware keyframe"
```

---

### Task 5: video — `buildVideoPrompt` + model-dispatching `generateSceneVideo`

**Files:**
- Modify: `src/services/studio/video.ts`
- Test: `src/services/studio/video.test.ts`

**Interfaces:**
- Consumes: `Scene`, `VideoModelId`, `getVideoModel`, `nativeVideo`, `QueuePhase` (Tasks 1, 2).
- Produces: `buildVideoPrompt(scene: Scene, character voices: Map<string,string>, audio: boolean): string`, `generateSceneVideo(args): Promise<{ url: string }>` where `args = { model: VideoModelId; scene: Scene; keyframeUrl: string; voiceByName: Map<string,string>; durationSec: number; aspect: 'landscape'|'portrait' }`.
- Removes: `buildElementPrompt`, the old `generateSceneVideo` signature, `lipSyncScene`.

- [ ] **Step 1: Write the failing test**

Replace `src/services/studio/video.test.ts` body with:

```ts
import { describe, it, expect } from 'vitest'
import { buildVideoPrompt } from './video'
import type { Scene } from '@/lib/types'

const scene: Scene = {
  id: '1',
  title: 'Meet',
  speakers: ['Rio', 'Bo'],
  visual: 'Rio waves at Bo in a sunny park, wide shot',
  dialogue: 'Rio: "Hi Bo!" Bo: "Hello Rio."',
}
const voices = new Map([
  ['rio', 'bright high energetic girl'],
  ['bo', 'deep calm synthetic'],
])

describe('buildVideoPrompt', () => {
  it('for audio models includes visual, dialogue, and per-speaker voice descriptions', () => {
    const p = buildVideoPrompt(scene, voices, true)
    expect(p).toContain('sunny park')
    expect(p).toContain('Hi Bo')
    expect(p).toContain('bright high energetic girl')
    expect(p).toContain('deep calm synthetic')
  })

  it('for silent models includes the visual but omits dialogue lines', () => {
    const p = buildVideoPrompt(scene, voices, false)
    expect(p).toContain('sunny park')
    expect(p).not.toContain('Hi Bo')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/studio/video.test.ts`
Expected: FAIL — `buildVideoPrompt` not exported (file still exports `buildElementPrompt`).

- [ ] **Step 3: Rewrite `video.ts`**

Replace the full contents of `src/services/studio/video.ts` with:

```ts
import { getVideoModel, nativeVideo, type QueuePhase, type VideoModelId } from '@/services/fal/client'
import type { Scene } from '@/lib/types'

/**
 * Compose the prompt sent to the video model. Audio-capable models get the visual + a
 * voice-description line per speaker + the dialogue (so the same character sounds
 * consistent across shots — best-effort). Silent models get the visual only.
 */
export function buildVideoPrompt(scene: Scene, voiceByName: Map<string, string>, audio: boolean): string {
  const parts: string[] = [scene.visual.trim()]
  if (audio && scene.dialogue.trim()) {
    const voiceLines = scene.speakers
      .map((n) => {
        const v = voiceByName.get(n.toLowerCase())
        return v ? `${n} (${v})` : ''
      })
      .filter(Boolean)
    if (voiceLines.length) parts.push(`Voices — ${voiceLines.join('; ')}.`)
    parts.push(scene.dialogue.trim())
  }
  return parts.filter(Boolean).join('\n')
}

export interface GenerateSceneVideoArgs {
  model: VideoModelId
  scene: Scene
  keyframeUrl: string
  voiceByName: Map<string, string>
  durationSec: number
  aspect: 'landscape' | 'portrait'
}

/** Generate one shot's video (audio embedded when the model supports it). */
export async function generateSceneVideo(
  args: GenerateSceneVideoArgs,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  const model = getVideoModel(args.model)
  const prompt = buildVideoPrompt(args.scene, args.voiceByName, model.audio)
  return nativeVideo(
    { model: args.model, prompt, startImageUrl: args.keyframeUrl, durationSec: args.durationSec, aspect: args.aspect },
    onPhase ? { onProgress: onPhase } : {},
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/video.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/studio/video.ts src/services/studio/video.test.ts
git commit -m "feat(video): buildVideoPrompt + model-dispatching generateSceneVideo; drop lip-sync"
```

---

### Task 6: generate — video-first orchestration (no voice mint / audio / lip-sync)

**Files:**
- Modify: `src/services/studio/generate.ts`
- Test: `src/services/studio/generate.test.ts`

**Interfaces:**
- Consumes: `mintCharacterImage`, `sceneKeyframe` (Task 4), `generateSceneVideo` (Task 5), `Plan`, `Character`, `CharacterImage`, `VideoModelId`, `QueuePhase`.
- Produces: `GenerateCallbacks` (video-only), `generateSceneClip(args): Promise<{ url: string }>` (single-scene, reused by regen), `generateFromPlan(plan, args, cb): Promise<void>` where `args = { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape'|'portrait' }`.
- Removes: `mintVoice`, `generateScene`, `isOverLimitError`.

- [ ] **Step 1: Rewrite `generate.ts`**

Replace the full contents of `src/services/studio/generate.ts` with:

```ts
import type { QueuePhase, VideoModelId } from '@/services/fal/client'
import { mintCharacterImage, sceneKeyframe } from './image'
import { generateSceneVideo } from './video'
import type { CharacterImage, Plan, Scene } from '@/lib/types'

export interface GenerateCallbacks {
  onCharacterImage?: (img: CharacterImage) => void
  onSceneStart?: (sceneId: string) => void
  onKeyframe?: (sceneId: string, url: string) => void
  onScenePhase?: (sceneId: string, phase: QueuePhase) => void
  onScene?: (sceneId: string, result: { url: string }) => void
  onError?: (scope: string, message: string) => void
}

export interface SceneClipArgs {
  scene: Scene
  imageByName: Map<string, string>
  voiceByName: Map<string, string>
  videoModel: VideoModelId
  aspect: 'landscape' | 'portrait'
  durationSec: number
}

/**
 * Render one shot: compose the present characters into a keyframe, then generate the
 * video (audio embedded when the model supports it). Reused by the full run and by regen.
 */
export async function generateSceneClip(
  args: SceneClipArgs,
  cb: Pick<GenerateCallbacks, 'onKeyframe' | 'onScenePhase'> = {},
): Promise<{ url: string }> {
  const presentImages = args.scene.speakers
    .map((n) => args.imageByName.get(n.toLowerCase()))
    .filter((u): u is string => !!u)
  const keyframe = await sceneKeyframe(args.scene, presentImages, args.aspect)
  cb.onKeyframe?.(args.scene.id, keyframe)
  return generateSceneVideo(
    {
      model: args.videoModel,
      scene: args.scene,
      keyframeUrl: keyframe,
      voiceByName: args.voiceByName,
      durationSec: args.durationSec,
      aspect: args.aspect,
    },
    (p) => cb.onScenePhase?.(args.scene.id, p),
  )
}

/**
 * Full pipeline: mint any missing character images (reuse the library by name), then
 * render every shot in order. Voice descriptions come from the plan's characters.
 */
export async function generateFromPlan(
  plan: Plan,
  args: { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape' | 'portrait' },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const imageByName = new Map<string, string>()
  for (const img of args.characterLibrary ?? []) imageByName.set(img.name.toLowerCase(), img.url)
  const voiceByName = new Map<string, string>()
  for (const c of plan.characters) voiceByName.set(c.name.toLowerCase(), c.voice)

  for (const c of plan.characters) {
    const key = c.name.toLowerCase()
    if (imageByName.has(key)) continue
    try {
      const img = await mintCharacterImage(c)
      cb.onCharacterImage?.(img)
      imageByName.set(key, img.url)
    } catch (e) {
      cb.onError?.(`image:${c.name}`, e instanceof Error ? e.message : String(e))
    }
  }

  for (const scene of plan.scenes) {
    cb.onSceneStart?.(scene.id)
    try {
      const r = await generateSceneClip(
        { scene, imageByName, voiceByName, videoModel: args.videoModel, aspect: args.aspect, durationSec: 8 },
        cb,
      )
      cb.onScene?.(scene.id, r)
    } catch (e) {
      cb.onError?.(`scene:${scene.id}`, e instanceof Error ? e.message : String(e))
    }
  }
}
```

- [ ] **Step 2: Replace the stale generate test with a shape/behaviour test**

Replace `src/services/studio/generate.test.ts` body with a test that mocks the fal service layer and asserts the orchestration order (mint missing image → keyframe → video), reusing library images:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./image', () => ({
  mintCharacterImage: vi.fn(async (c: { name: string }) => ({ id: c.name, name: c.name, url: `img:${c.name}`, source: 'minted', createdAt: 0 })),
  sceneKeyframe: vi.fn(async () => 'keyframe-url'),
}))
vi.mock('./video', () => ({
  generateSceneVideo: vi.fn(async () => ({ url: 'video-url' })),
}))

import { generateFromPlan } from './generate'
import { mintCharacterImage, sceneKeyframe } from './image'
import { generateSceneVideo } from './video'
import type { Plan } from '@/lib/types'

const plan: Plan = {
  category: 'Cartoon',
  characters: [
    { name: 'Rio', appearance: 'girl', voice: 'bright' },
    { name: 'Bo', appearance: 'robot', voice: 'deep' },
  ],
  scenes: [{ id: 's1', title: 'Meet', speakers: ['Rio', 'Bo'], visual: 'park', dialogue: 'Rio: "Hi"' }],
}

beforeEach(() => vi.clearAllMocks())

describe('generateFromPlan', () => {
  it('mints only missing character images and renders each shot', async () => {
    const scenes: string[] = []
    await generateFromPlan(
      plan,
      { characterLibrary: [{ id: 'x', name: 'Rio', url: 'lib:Rio', source: 'uploaded', createdAt: 0 }], videoModel: 'bytedance/seedance-2.0/image-to-video', aspect: 'landscape' },
      { onScene: (id) => scenes.push(id) },
    )
    // Rio is in the library, only Bo is minted.
    expect((mintCharacterImage as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].name)).toEqual(['Bo'])
    expect(sceneKeyframe).toHaveBeenCalledTimes(1)
    expect(generateSceneVideo).toHaveBeenCalledTimes(1)
    expect(scenes).toEqual(['s1'])
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/generate.test.ts`
Expected: PASS (mint called once for Bo, keyframe + video once, `onScene` fired for `s1`).

- [ ] **Step 4: Commit**

```bash
git add src/services/studio/generate.ts src/services/studio/generate.test.ts
git commit -m "feat(generate): video-first orchestration (image->keyframe->video), drop audio/lipsync"
```

---

### Task 7: cost — per-second video pricing by model

**Files:**
- Modify: `src/lib/cost.ts`
- Test: `src/lib/cost.test.ts` (create)

**Interfaces:**
- Consumes: `Plan` (Task 2), `getVideoModel`, `VideoModelId` (Task 1).
- Produces: `estimatePlanCost(plan, videoModel, shotSec?): number`, `clipCost(videoModel, durationSec): number`, `formatUSD(n): string` (unchanged).
- Removes: `PER_MIN`, `VIDEO_PER_SEC`, `LIPSYNC_EACH`, the old `estimatePlanCost`/`clipCost` signatures.

- [ ] **Step 1: Write the failing test**

Create `src/lib/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estimatePlanCost, clipCost, formatUSD } from './cost'
import { getVideoModel } from '@/services/fal/client'
import type { Plan } from './types'

const plan: Plan = {
  category: 'Cartoon',
  characters: [{ name: 'Rio', appearance: 'girl', voice: 'bright' }],
  scenes: [
    { id: 's1', title: 'A', speakers: ['Rio'], visual: 'v', dialogue: 'd' },
    { id: 's2', title: 'B', speakers: [], visual: 'v', dialogue: '' },
  ],
}

describe('cost', () => {
  it('clipCost = price/sec * duration for the model', () => {
    const m = getVideoModel('bytedance/seedance-2.0/image-to-video')
    expect(clipCost(m.id, 8)).toBeCloseTo(m.pricePerSec * 8, 5)
  })

  it('estimatePlanCost = images + shots * shotSec * price/sec', () => {
    const m = getVideoModel('fal-ai/veo3.1/image-to-video')
    const est = estimatePlanCost(plan, m.id, 8)
    const IMAGE_EACH = 0.039
    const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
    const video = plan.scenes.length * 8 * m.pricePerSec
    expect(est).toBeCloseTo(images + video, 5)
  })

  it('formatUSD floors tiny values', () => {
    expect(formatUSD(0.004)).toBe('<$0.01')
    expect(formatUSD(1.5)).toBe('$1.50')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: FAIL — signatures mismatch (`estimatePlanCost` still takes `targetDurationSec, withVideo`).

- [ ] **Step 3: Rewrite `cost.ts`**

Replace the full contents of `src/lib/cost.ts` with:

```ts
import type { Plan } from './types'
import { getVideoModel } from '@/services/fal/client'

/** nano-banana image price ($/image), for characters + shot keyframes. */
const IMAGE_EACH = 0.039

/** Cost of one generated shot on a model at a given duration (seconds). */
export function clipCost(videoModel: string, durationSec: number): number {
  return getVideoModel(videoModel).pricePerSec * durationSec
}

/**
 * Rough cost estimate: one reference image per character + one keyframe per shot, plus
 * each shot's video at the selected model's per-second price.
 */
export function estimatePlanCost(plan: Plan, videoModel: string, shotSec = 8): number {
  const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
  const video = plan.scenes.length * shotSec * getVideoModel(videoModel).pricePerSec
  return images + video
}

export function formatUSD(n: number): string {
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cost.ts src/lib/cost.test.ts
git commit -m "feat(cost): per-second video pricing by selected model"
```

---

### Task 8: store — `videoModel` state + simplified run/regen; drop voice library

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: `generateFromPlan`, `generateSceneClip`, `GenerateCallbacks` (Task 6), `makePlan` (Task 3), `DEFAULT_VIDEO_MODEL`, `VideoModelId` (Task 1), revised `Brief`/`Clip`/`Session` (Task 2).
- Produces: store fields `videoModel: string`, `setVideoModel(id)`, `aspect` via `brief.aspect`; removes `library`, `characterLibrary`-voice code stays only for images, `addVoice`/`removeVoice`/`clearLibrary`.
- Removes: all `Voice`/`library` state + actions, `provided` voices, audio/lipsync callbacks.

- [ ] **Step 1: Rewrite `useStore.ts`**

Replace the full contents of `src/store/useStore.ts` with:

```ts
import { create } from 'zustand'
import { uid, sessionTitle } from '@/lib/utils'
import { mapFalError } from '@/services/fal/errors'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL, type VideoModelId } from '@/services/fal/client'
import { makePlan } from '@/services/studio/plan'
import { generateFromPlan, generateSceneClip } from '@/services/studio/generate'
import type { Brief, Clip, CharacterImage, Plan, Session, StudioStatus } from '@/lib/types'

const MODEL_KEY = 'seed-audio-studio:model'
const VIDEO_MODEL_KEY = 'seed-audio-studio:videoModel'
const CHAR_KEY = 'seed-audio-studio:characters'
const SESS_KEY = 'seed-audio-studio:sessions'
const ACTIVE_KEY = 'seed-audio-studio:activeSession'

export interface Toast {
  id: string
  kind: 'info' | 'error' | 'success'
  title: string
  message?: string
}

function loadCharacterLibrary(): CharacterImage[] {
  try {
    return JSON.parse(localStorage.getItem(CHAR_KEY) ?? '[]') as CharacterImage[]
  } catch {
    return []
  }
}
function saveCharacterLibrary(v: CharacterImage[]) {
  localStorage.setItem(CHAR_KEY, JSON.stringify(v))
}

function loadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(SESS_KEY) ?? '[]') as Session[]
  } catch {
    return []
  }
}
function saveSessions(v: Session[]) {
  localStorage.setItem(SESS_KEY, JSON.stringify(v)) // may throw QuotaExceededError
}

const DEFAULT_BRIEF: Brief = {
  idea: '',
  durationSec: 40,
  language: 'EN',
  speakers: 'auto',
  genre: '',
  aspect: 'landscape',
}

interface Store {
  key: string | null
  keyDialogOpen: boolean
  toasts: Toast[]

  model: string
  videoModel: string
  brief: Brief
  characterLibrary: CharacterImage[]

  sessions: Session[]
  activeSessionId: string | null

  plan: Plan | null
  category: string | null
  clips: Clip[]
  status: StudioStatus
  currentStep: string | null

  setKey: (k: string | null) => void
  setKeyDialogOpen: (v: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  setModel: (m: string) => void
  setVideoModel: (m: string) => void
  setBrief: (patch: Partial<Brief>) => void

  addCharacterImage: (img: CharacterImage) => void
  removeCharacterImage: (id: string) => void
  clearCharacterLibrary: () => void

  beginSession: () => void
  saveActiveSession: () => void
  newSession: () => void
  loadSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void

  clearResults: () => void
  runStudio: () => Promise<void>
  regenScene: (sceneId: string) => Promise<void>
}

const _sessions0 = loadSessions()
const _activeId0 = localStorage.getItem(ACTIVE_KEY)
const _active0 = _sessions0.find((x) => x.id === _activeId0) ?? null
if (_activeId0 && !_active0) localStorage.removeItem(ACTIVE_KEY)

export const useStore = create<Store>((set, get) => ({
  key: null,
  keyDialogOpen: false,
  toasts: [],

  model: localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL,
  videoModel: localStorage.getItem(VIDEO_MODEL_KEY) ?? DEFAULT_VIDEO_MODEL,
  brief: _active0 ? _active0.brief : DEFAULT_BRIEF,
  characterLibrary: loadCharacterLibrary(),

  sessions: _sessions0,
  activeSessionId: _active0 ? _activeId0 : null,

  plan: _active0?.plan ?? null,
  category: _active0?.category ?? null,
  clips: _active0?.clips ?? [],
  status: _active0 && _active0.clips.length ? 'done' : 'idle',
  currentStep: null,

  setKey: (k) => set({ key: k }),
  setKeyDialogOpen: (v) => set({ keyDialogOpen: v }),
  toast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setModel: (m) => {
    localStorage.setItem(MODEL_KEY, m)
    set({ model: m })
  },
  setVideoModel: (m) => {
    localStorage.setItem(VIDEO_MODEL_KEY, m)
    set({ videoModel: m })
  },
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),

  addCharacterImage: (img) =>
    set((s) => {
      const next = [img, ...s.characterLibrary.filter((x) => x.id !== img.id)]
      saveCharacterLibrary(next)
      return { characterLibrary: next }
    }),
  removeCharacterImage: (id) =>
    set((s) => {
      const next = s.characterLibrary.filter((x) => x.id !== id)
      saveCharacterLibrary(next)
      return { characterLibrary: next }
    }),
  clearCharacterLibrary: () => {
    saveCharacterLibrary([])
    set({ characterLibrary: [] })
  },

  beginSession: () => {
    const s = get()
    if (s.activeSessionId) return
    const now = Date.now()
    const sess: Session = {
      id: uid(),
      title: sessionTitle(s.brief.idea),
      createdAt: now,
      updatedAt: now,
      brief: s.brief,
      plan: null,
      category: null,
      clips: [],
      videoModel: s.videoModel,
    }
    const next = [sess, ...s.sessions]
    try {
      saveSessions(next)
    } catch {
      get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      return
    }
    localStorage.setItem(ACTIVE_KEY, sess.id)
    set({ sessions: next, activeSessionId: sess.id })
  },

  saveActiveSession: () => {
    const s = get()
    if (!s.activeSessionId) return
    const next = s.sessions.map((x) =>
      x.id === s.activeSessionId
        ? { ...x, brief: s.brief, plan: s.plan, category: s.category, clips: s.clips, videoModel: s.videoModel, updatedAt: Date.now() }
        : x,
    )
    try {
      saveSessions(next)
    } catch {
      get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      return
    }
    set({ sessions: next })
  },

  newSession: () => {
    localStorage.removeItem(ACTIVE_KEY)
    set({ activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, category: null, clips: [], status: 'idle', currentStep: null })
  },

  loadSession: (id) => {
    const sess = get().sessions.find((x) => x.id === id)
    if (!sess) return
    localStorage.setItem(ACTIVE_KEY, id)
    set({
      activeSessionId: id,
      brief: sess.brief,
      plan: sess.plan,
      category: sess.category,
      clips: sess.clips,
      videoModel: sess.videoModel ?? get().videoModel,
      status: sess.clips.length ? 'done' : 'idle',
      currentStep: null,
    })
  },

  renameSession: (id, title) =>
    set((s) => {
      const t = title.trim() || 'Untitled'
      const next = s.sessions.map((x) => (x.id === id ? { ...x, title: t, updatedAt: Date.now() } : x))
      try {
        saveSessions(next)
      } catch {
        get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      }
      return { sessions: next }
    }),

  deleteSession: (id) =>
    set((s) => {
      const next = s.sessions.filter((x) => x.id !== id)
      try {
        saveSessions(next)
      } catch {
        get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      }
      if (s.activeSessionId === id) {
        localStorage.removeItem(ACTIVE_KEY)
        return { sessions: next, activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, category: null, clips: [], status: 'idle', currentStep: null }
      }
      return { sessions: next }
    }),

  clearResults: () => set({ plan: null, category: null, clips: [], status: 'idle', currentStep: null }),

  runStudio: async () => {
    const { key, brief, model, videoModel } = get()
    if (!key) {
      set({ keyDialogOpen: true })
      return
    }
    if (!brief.idea.trim()) {
      get().toast({ kind: 'error', title: 'Add a brief', message: 'Describe the video you want to generate.' })
      return
    }
    get().beginSession()
    set({ status: 'planning', currentStep: 'Planning shots…', plan: null, clips: [] })
    let plan: Plan
    try {
      plan = await makePlan(brief, model)
    } catch (e) {
      const fe = mapFalError(e)
      set({ status: 'error', currentStep: null })
      get().toast({ kind: 'error', title: fe.title, message: fe.message })
      return
    }

    const clips: Clip[] = plan.scenes.map((sc) => ({
      id: uid(),
      sceneId: sc.id,
      title: sc.title,
      speakers: sc.speakers,
      prompt: [sc.visual, sc.dialogue].filter(Boolean).join('\n'),
      status: 'pending',
    }))
    set({ plan, category: plan.category, clips, status: 'generating' })
    get().saveActiveSession()

    const patchClipByScene = (sceneId: string, patch: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...patch } : c)) }))

    await generateFromPlan(
      plan,
      { characterLibrary: get().characterLibrary, videoModel: videoModel as VideoModelId, aspect: brief.aspect },
      {
        onCharacterImage: (img) => get().addCharacterImage(img),
        onSceneStart: (sceneId) => {
          set({ currentStep: 'Generating video…' })
          patchClipByScene(sceneId, { status: 'running' })
        },
        onKeyframe: (sceneId, url) => patchClipByScene(sceneId, { imageUrl: url }),
        onScenePhase: (sceneId, phase) => patchClipByScene(sceneId, { phase }),
        onScene: (sceneId, r) => {
          patchClipByScene(sceneId, { status: 'done', videoUrl: r.url })
          get().saveActiveSession()
        },
        onError: (scope, message) => {
          if (scope.startsWith('scene:')) {
            patchClipByScene(scope.slice('scene:'.length), { status: 'error', error: message })
          } else {
            get().toast({ kind: 'error', title: 'Generation issue', message })
          }
        },
      },
    )
    set({ status: 'done', currentStep: null })
    get().saveActiveSession()
  },

  regenScene: async (sceneId) => {
    const { plan, characterLibrary, brief, videoModel } = get()
    if (!plan) return
    const scene = plan.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    const patch = (p: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...p } : c)) }))
    patch({ status: 'running', error: undefined, videoUrl: undefined, imageUrl: undefined, phase: undefined })
    try {
      const imageByName = new Map<string, string>()
      for (const img of characterLibrary) imageByName.set(img.name.toLowerCase(), img.url)
      const voiceByName = new Map<string, string>()
      for (const c of plan.characters) voiceByName.set(c.name.toLowerCase(), c.voice)
      const r = await generateSceneClip(
        { scene, imageByName, voiceByName, videoModel: videoModel as VideoModelId, aspect: brief.aspect, durationSec: 8 },
        { onKeyframe: (_id, url) => patch({ imageUrl: url }), onScenePhase: (_id, phase) => patch({ phase }) },
      )
      patch({ status: 'done', videoUrl: r.url })
    } catch (e) {
      const fe = mapFalError(e)
      patch({ status: 'error', error: fe.message })
      get().toast({ kind: 'error', title: fe.title, message: fe.message })
    }
    get().saveActiveSession()
  },
}))
```

- [ ] **Step 2: Typecheck the store (UI errors expected, store itself clean)**

Run: `pnpm typecheck`
Expected: FAIL only in UI components (Task 9). No errors inside `useStore.ts`, `generate.ts`, `plan.ts`, `video.ts`, `image.ts`, `cost.ts`, `client.ts`, `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(store): videoModel state + video-first run/regen; remove voice library"
```

---
### Task 9: UI — `VideoModelPicker` component + BriefForm (drop voice/withVideo, add aspect + model picker)

**Files:**
- Create: `src/components/VideoModelPicker.tsx`
- Modify: `src/components/BriefForm.tsx`

**Interfaces:**
- Consumes: store `videoModel`/`setVideoModel`, `brief.aspect` (Task 8), `VIDEO_MODELS`/`getVideoModel` (Task 1), `clipCost`/`formatUSD` (Task 7).
- Produces: `VideoModelPicker` component (no props).

- [ ] **Step 1: Create `VideoModelPicker.tsx`**

```tsx
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { VIDEO_MODELS, getVideoModel } from '@/services/fal/client'
import { clipCost, formatUSD } from '@/lib/cost'

/** Picker for the video generation model. Shows each tier's price; description + per-shot estimate below. */
export function VideoModelPicker() {
  const videoModel = useStore((s) => s.videoModel)
  const setVideoModel = useStore((s) => s.setVideoModel)
  const selected = getVideoModel(videoModel)
  const shotSec = Math.min(8, selected.maxDurationSec)

  return (
    <div className="space-y-2">
      <Label>Video model</Label>
      <Select value={videoModel} onValueChange={setVideoModel}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label} · {formatUSD(m.pricePerSec)}/s{m.audio ? '' : ' · silent'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {selected.description} · ~{formatUSD(clipCost(selected.id, shotSec))}/shot ·{' '}
        {selected.audio ? 'native audio' : 'silent'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `BriefForm.tsx`**

Replace the full contents of `src/components/BriefForm.tsx` with:

```tsx
import { Sparkles, Loader2 } from 'lucide-react'
import {
  Button,
  Textarea,
  Label,
  Slider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/components/ui'
import { VideoModelPicker } from '@/components/VideoModelPicker'
import { useStore } from '@/store/useStore'

const EXAMPLES = [
  'A cartoon fox discovers a glowing lamp in a moonlit forest and gasps in wonder.',
  'A tense noir detective confronts a suspect in a rain-soaked alley at midnight.',
  'A 15-second upbeat advertisement for a fictional artisan coffee brand.',
  'A sci-fi pilot warns her crew as alarms flash across the cockpit.',
]

export function BriefForm() {
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const run = useStore((s) => s.runStudio)
  const status = useStore((s) => s.status)
  const hasKey = useStore((s) => !!s.key)
  const busy = status === 'planning' || status === 'generating'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="idea">Brief</Label>
        <Textarea
          id="idea"
          rows={5}
          placeholder="Describe the video you want…"
          value={brief.idea}
          onChange={(e) => setBrief({ idea: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="text-left text-xs rounded-md border border-border/60 px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => setBrief({ idea: ex })}
            >
              {ex.length > 46 ? ex.slice(0, 44) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Target length: {brief.durationSec}s</Label>
          <Slider
            min={15}
            max={120}
            step={5}
            value={[brief.durationSec]}
            onValueChange={([v]) => setBrief({ durationSec: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>Speakers</Label>
          <Select
            value={String(brief.speakers)}
            onValueChange={(v) => setBrief({ speakers: v === 'auto' ? 'auto' : (Number(v) as 1 | 2 | 3) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={brief.language} onValueChange={(v) => setBrief({ language: v as 'EN' | 'ZH' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EN">English</SelectItem>
              <SelectItem value="ZH">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Orientation</Label>
          <Select
            value={brief.aspect}
            onValueChange={(v) => setBrief({ aspect: v as 'landscape' | 'portrait' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Landscape 16:9</SelectItem>
              <SelectItem value="portrait">Portrait 9:16</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label htmlFor="genre">Genre hint</Label>
          <Input
            id="genre"
            placeholder="optional"
            value={brief.genre}
            onChange={(e) => setBrief({ genre: e.target.value })}
          />
        </div>
      </div>

      <VideoModelPicker />

      <Button className="w-full" disabled={busy} onClick={() => run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? 'Generating…' : hasKey ? 'Generate video' : 'Add key & generate'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoModelPicker.tsx src/components/BriefForm.tsx
git commit -m "feat(ui): VideoModelPicker + video-first BriefForm (aspect, drop voice/withVideo)"
```

---

### Task 10: UI — ClipCard renders a single video (embedded audio), no lip-sync/audio fallbacks

**Files:**
- Modify: `src/components/ClipCard.tsx`

**Interfaces:**
- Consumes: revised `Clip` (Task 2), store `regenScene` + `videoModel`, `clipCost`/`formatUSD` (Task 7).

- [ ] **Step 1: Rewrite `ClipCard.tsx`**

Replace the full contents of `src/components/ClipCard.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { Download, RefreshCw, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Clip } from '@/lib/types'

export function ClipCard({ clip }: { clip: Clip }) {
  const regen = useStore((s) => s.regenScene)
  const [showPrompt, setShowPrompt] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  useEffect(() => setMediaError(false), [clip.videoUrl])
  const busy = clip.status === 'running'

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-medium truncate">{clip.title}</span>
            {clip.speakers.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{clip.speakers.join(' · ')}</div>
            )}
          </div>
        </div>

        {clip.status === 'done' && clip.videoUrl && (
          <video
            src={clip.videoUrl}
            controls
            playsInline
            preload="none"
            poster={clip.imageUrl}
            className="w-full rounded-md border border-border/60"
            onError={() => setMediaError(true)}
          />
        )}
        {mediaError && <p className="text-xs text-muted-foreground">media link expired — regenerate this clip</p>}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {clip.phase === 'queued' ? 'Queued…' : 'Generating…'}
          </div>
        )}
        {clip.status === 'pending' && <div className="text-sm text-muted-foreground">Waiting…</div>}
        {clip.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{clip.error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt((v) => !v)}>
            <ChevronDown className={`size-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} /> Prompt
          </Button>
          {clip.videoUrl && (
            <a href={clip.videoUrl} download={`${clip.title.replace(/\s+/g, '_')}.mp4`}>
              <Button variant="ghost" size="sm">
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => regen(clip.sceneId)}>
            <RefreshCw className="size-4" /> Regenerate
          </Button>
        </div>

        {showPrompt && (
          <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-3 border border-border/60 text-muted-foreground">
            {clip.prompt}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ClipCard.tsx
git commit -m "feat(ui): ClipCard renders single video clip; drop audio/lip-sync fallbacks"
```

---

### Task 11: UI — Studio screen (remove voice panel, fix cost estimate) + SettingsDialog + delete VoiceLibraryPanel

**Files:**
- Modify: `src/screens/Studio.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Delete: `src/components/VoiceLibraryPanel.tsx`

**Interfaces:**
- Consumes: store `videoModel`, `characterLibrary`, `clearCharacterLibrary` (Task 8), `estimatePlanCost` (Task 7).

- [ ] **Step 1: Rewrite `Studio.tsx`**

Replace the full contents of `src/screens/Studio.tsx` with:

```tsx
import { useState } from 'react'
import { Clapperboard, Loader2, Menu } from 'lucide-react'
import { Badge, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { CharacterLibraryPanel } from '@/components/CharacterLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { SessionSidebar } from '@/components/SessionSidebar'
import { useStore } from '@/store/useStore'
import { estimatePlanCost, formatUSD } from '@/lib/cost'
import { cn } from '@/lib/utils'

export function Studio() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)
  const plan = useStore((s) => s.plan)
  const videoModel = useStore((s) => s.videoModel)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-[1400px] px-5 py-3 flex items-center gap-2.5">
          <button className="lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sessions">
            <Menu className="size-5" />
          </button>
          <Clapperboard className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Seed Studio</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <div className={cn('w-60 shrink-0 border-r border-border/60', sidebarOpen ? 'block' : 'hidden lg:block')}>
          <SessionSidebar />
        </div>

        <main className="min-w-0 flex-1 px-5 py-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left: inputs + library */}
          <div className="space-y-5">
            <Card>
              <CardContent className="pt-5">
                <BriefForm />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-5">
                <CharacterLibraryPanel />
              </CardContent>
            </Card>
          </div>

          {/* Right: status + results */}
          <div className="space-y-4">
            {status !== 'idle' && (
              <div className="flex items-center gap-2 text-sm">
                {(status === 'planning' || status === 'generating') && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {category && <Badge>{category}</Badge>}
                <span className="text-muted-foreground">
                  {currentStep ?? (status === 'done' ? 'Done.' : status === 'error' ? 'Failed.' : '')}
                </span>
                {plan && (
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    Est. cost: {formatUSD(estimatePlanCost(plan, videoModel))}
                  </span>
                )}
              </div>
            )}

            {status === 'idle' && clips.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                <Clapperboard className="size-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Describe a video on the left and hit Generate.</p>
                <p className="text-xs mt-1">
                  The model plans short shots, mints a reference image per character, and renders each shot as a video
                  with native audio.
                </p>
              </div>
            ) : (
              <>
                {clips.length > 0 && <Separator />}
                <div className="grid gap-3 sm:grid-cols-2">
                  {clips.map((c) => (
                    <ClipCard key={c.id} clip={c} />
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `SettingsDialog.tsx`**

Replace the full contents of `src/components/SettingsDialog.tsx` with:

```tsx
import { Trash2, KeyRound, Library } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { clearKey } from '@/services/fal/keyStore'
import { MODELS } from '@/services/fal/client'

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const setKey = useStore((s) => s.setKey)
  const clearResults = useStore((s) => s.clearResults)
  const clearCharacterLibrary = useStore((s) => s.clearCharacterLibrary)
  const toast = useStore((s) => s.toast)
  const model = useStore((s) => s.model)
  const setModel = useStore((s) => s.setModel)
  const charCount = useStore((s) => s.characterLibrary.length)

  function forgetKey() {
    clearKey()
    setKey(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your key and character library live only in this browser.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Planning model (OpenRouter)</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-2" />

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => {
              clearResults()
              toast({ kind: 'success', title: 'Results cleared' })
              onOpenChange(false)
            }}
          >
            <Trash2 className="size-4" /> Clear results
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearCharacterLibrary()
              toast({ kind: 'success', title: 'Character library cleared' })
            }}
          >
            <Library className="size-4" /> Clear character library ({charCount})
          </Button>
          <Button variant="destructive" onClick={forgetKey}>
            <KeyRound className="size-4" /> Forget API key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Delete the voice library panel and orphaned audio helpers**

After the BriefForm (Task 9) and generate.ts (Task 6) rewrites, `VoiceLibraryPanel.tsx` and the WebAudio helpers `trim.ts` / `concat.ts` have no remaining importers. Verify then delete:

```bash
grep -rn "services/audio\|VoiceLibraryPanel" src --include="*.ts" --include="*.tsx"   # expect no matches
git rm src/components/VoiceLibraryPanel.tsx src/services/audio/trim.ts src/services/audio/concat.ts
```

(If either audio file still has an importer, that file was missed by an earlier task — fix it before deleting.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/Studio.tsx src/components/SettingsDialog.tsx
git commit -m "feat(ui): video-first Studio + settings; remove voice library panel"
```

---

### Task 12: Verification — typecheck, lint, full test run, build

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole project**

Run: `pnpm typecheck`
Expected: PASS (0 errors). If any file still references removed symbols (`Voice`, `voiceSpec`, `refPrompt`, `withVideo`, `voiceIds`, `lipsyncUrl`, `kind`, `mintVoice`, `seedAudio`, `latentSync`), fix that reference to match the new types, then re-run.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS. Fix any unused-import warnings introduced by the rewrites (e.g. removed `AudioLines`).

- [ ] **Step 3: Full test suite**

Run: `pnpm test:run`
Expected: PASS — `client.test.ts`, `plan.test.ts`, `image.test.ts`, `video.test.ts`, `generate.test.ts`, `cost.test.ts`, plus the untouched `errors.test.ts`. Confirm no test still imports a deleted symbol.

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: `tsc -b` passes and `vite build` emits `dist/` with no errors.

- [ ] **Step 5: Manual smoke test (real fal key)**

Run: `pnpm dev`, open the app, enter a fal key, type a one-line brief, pick each video model tier once, and Generate. Verify: a plan of ≤8s shots appears; a character image mints; each shot renders a single video clip that plays with audio (silent for kling); the est-cost line reflects the selected model; regenerate re-renders one shot. Note anything broken before merging.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix typecheck/lint/test fallout from video-first refactor"
```

---

## Notes for the implementer

- **fal field names are the one real unknown.** Before Task 1 step 3, open the fal API pages for Veo 3.1 i2v, Seedance 2.0 i2v, and kling v3 i2v and confirm the input keys (`image_url` vs `start_image_url`, `duration` seconds-int vs `"8s"` string, `resolution`, `aspect_ratio`, `generate_audio`). All mapping lives in `buildVideoInput` — correct it there once.
- **Voice consistency is best-effort** — the per-speaker voice description in `buildVideoPrompt` is the only lever; there is no voice pinning.
- **`durationSec` is fixed at 8** in the orchestrator; the model clamps to its own max. If you later want per-brief shot length, thread it through `SceneClipArgs.durationSec`.
