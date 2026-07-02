# Biography Video Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Biography" content type that turns a one-line brief about a person into a page-by-page breakdown of **silent** cinematic shots, with age-stage character consistency; narration/audio is added by the user externally.

**Architecture:** Reuse the video-first plumbing (model registry, `nativeVideo`, nano-banana keyframes, sessions, cost). Add a biography planner (`makeBioPlan`/`parseBioPlan`), a silent render path (`forceSilent` on `nativeVideo` + `generateBiography`), a per-life-stage reference portrait, and a page-grouped results view. A `Brief.type` toggle selects story vs biography.

**Tech Stack:** TypeScript, React 19, Zustand, Vite, Vitest (jsdom), Tailwind v4 + Radix, fal.ai client.

## Global Constraints

- **Silent always in biography** — never request audio, never send narration to the video model. Narration is external-audio metadata only.
- **Generate from a brief** (no import of a pre-written breakdown in v1). LLM decides the number of pages/shots; the user picks a **uniform `shotSec`** (no target-length parameter).
- **Age-stage consistency:** LLM defines life `stages`; one reference portrait is minted per stage; each shot conditions its keyframe on its stage portrait. A global `style` string is threaded into every portrait, keyframe, and shot prompt.
- **Min clip duration** ~4s (Veo steps 4/6/8; seedance floors at 4; kling floors at 3 in code). `shotSec` offers model-valid values {4, 6, 8}; `buildVideoInput` clamps.
- Path alias `@/` → `src/`. One test file: `pnpm vitest run <path>`; typecheck `pnpm typecheck`; full suite `pnpm test:run`; build `pnpm build`.
- Out of scope (external/user): concat into one film, end card, audio/TTS/mux, breakdown import.

---

### Task 1: Types — biography data model + Brief/Session fields

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `BioStage`, `BioShot`, `BioPage`, `BiographyPlan`; `Brief.type: 'story' | 'biography'`, `Brief.shotSec: number`; `Session.bioPlan: BiographyPlan | null`.
- Consumes: nothing new.

- [ ] **Step 1: Add the biography types**

In `src/lib/types.ts`, insert these interfaces immediately after the `Plan` interface (after line `}` closing `Plan`):

```ts
/** One life stage of the biography subject, e.g. "child ~10" / "teen ~15" / "adult". */
export interface BioStage {
  id: string
  /** Human label with an approximate age, e.g. "child ~10". */
  label: string
  /** Visual description of this stage's look (used for the reference portrait). */
  appearance: string
}

/** One silent biography shot; conditioned on its stage's reference portrait when set. */
export interface BioShot {
  id: string
  /** Which life stage this shot depicts (omitted for pure-atmosphere shots). */
  stageId?: string
  /** Shot description: setting, framing, camera move, lighting, action. */
  visual: string
}

/** A narration block (external-audio metadata) with the shots shown under it. */
export interface BioPage {
  id: string
  /** 1-based page number. */
  index: number
  /** Narrator script for this page — the user voices it externally; NOT sent to the model. */
  narration: string
  shots: BioShot[]
}

export interface BiographyPlan {
  subject: string
  /** Global visual style applied to every portrait, keyframe, and shot prompt. */
  style: string
  stages: BioStage[]
  pages: BioPage[]
}
```

- [ ] **Step 2: Add the Brief fields**

In `src/lib/types.ts`, replace the `Brief` interface with:

```ts
export interface Brief {
  idea: string
  durationSec: number
  language: 'EN' | 'ZH'
  speakers: 'auto' | 1 | 2 | 3
  genre: string
  /** Video output orientation. */
  aspect: 'landscape' | 'portrait'
  /** Content type: multi-character story (default) or a biography of a person. */
  type: 'story' | 'biography'
  /** Uniform per-shot duration (seconds) for biography mode. */
  shotSec: number
}
```

- [ ] **Step 3: Add the Session field**

In `src/lib/types.ts`, replace the `Session` interface with:

```ts
/** A saved run: brief + plan + results, persisted in localStorage and listed in the sidebar. */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  brief: Brief
  plan: Plan | null
  /** Biography plan when the run's brief.type is 'biography'. */
  bioPlan: BiographyPlan | null
  category: string | null
  clips: Clip[]
  /** Video model id used for this run. */
  videoModel: string
}
```

- [ ] **Step 4: Verify types compile in isolation**

Run: `pnpm typecheck 2>&1 | grep 'src/lib/types.ts'`
Expected: NO output (errors in consumers like `useStore.ts` that don't yet set `type`/`shotSec`/`bioPlan` are expected and fixed in later tasks; `types.ts` itself must be clean).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): biography data model + Brief.type/shotSec + Session.bioPlan"
```

---

### Task 2: fal client — `forceSilent` on nativeVideo/buildVideoInput

**Files:**
- Modify: `src/services/fal/client.ts`
- Test: `src/services/fal/client.test.ts`

**Interfaces:**
- Consumes: existing `VideoModel`, `getVideoModel`.
- Produces: `NativeVideoArgs.forceSilent?: boolean`; `buildVideoInput` sets `generate_audio: args.forceSilent ? false : model.audio` on every branch.

- [ ] **Step 1: Write the failing test**

Append to `src/services/fal/client.test.ts` (add the import of `getVideoModel`/`buildVideoInput` if not already imported at the top — they are exported from `./client`):

```ts
describe('buildVideoInput forceSilent', () => {
  it('forces generate_audio off on an audio-capable model when forceSilent is set', () => {
    const veo = getVideoModel('fal-ai/veo3.1/image-to-video')
    const seedance = getVideoModel('bytedance/seedance-2.0/image-to-video')
    expect(buildVideoInput(veo, { prompt: 'p', startImageUrl: 'u' }).generate_audio).toBe(true)
    expect(buildVideoInput(veo, { prompt: 'p', startImageUrl: 'u', forceSilent: true }).generate_audio).toBe(false)
    expect(buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u', forceSilent: true }).generate_audio).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: FAIL — `forceSilent` is not honored (veo still returns `generate_audio: true`).

- [ ] **Step 3: Implement**

In `src/services/fal/client.ts`, add `forceSilent` to the `NativeVideoArgs` interface:

```ts
export interface NativeVideoArgs {
  model: VideoModelId
  prompt: string
  startImageUrl: string
  durationSec?: number
  aspect?: 'landscape' | 'portrait'
  /** Force silent output (no audio) regardless of the model's default. */
  forceSilent?: boolean
}
```

Then in `buildVideoInput`, change each of the three `generate_audio: model.audio` (kling, veo3.1, seedance branches) to:

```ts
    generate_audio: args.forceSilent ? false : model.audio,
```

(There are three return objects — update all three. The kling branch currently reads `generate_audio: model.audio`; make it match so a `forceSilent` flag is consistent everywhere.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: PASS (all existing client tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/services/fal/client.ts src/services/fal/client.test.ts
git commit -m "feat(fal): forceSilent option on nativeVideo/buildVideoInput"
```

---

### Task 3: guide + plan — biography planner (`makeBioPlan`/`parseBioPlan`)

**Files:**
- Modify: `src/services/studio/guide.ts`
- Modify: `src/services/studio/plan.ts`
- Test: `src/services/studio/plan.test.ts`

**Interfaces:**
- Consumes: `Brief`, `BiographyPlan`, `BioStage`, `BioPage`, `BioShot` (Task 1); `llmText`, `RunOptions`, `uid`.
- Produces: `BIOGRAPHY_GUIDE`, `BIO_OUTPUT_DIRECTIVE` (guide.ts); `buildBioPrompt(b: Brief): string`, `parseBioPlan(text: string): BiographyPlan`, `makeBioPlan(brief: Brief, model: string, opts?: RunOptions): Promise<BiographyPlan>` (plan.ts).

- [ ] **Step 1: Write the failing test**

Append to `src/services/studio/plan.test.ts`. First extend the existing `./plan` import to include the new functions (e.g. change `import { parsePlan, buildPlanPrompt } from './plan'` → `import { parsePlan, buildPlanPrompt, parseBioPlan, buildBioPrompt } from './plan'`) and ensure `import type { Brief } from '@/lib/types'` is present. Then add:

```ts
const RAW_BIO = JSON.stringify({
  subject: 'Ada Lovelace',
  style: 'painterly educational animation, cinematic camera, warm lighting',
  stages: [
    { label: 'child ~10', appearance: 'young girl, curls, early-1800s dress' },
    { label: 'adult', appearance: 'woman in Victorian gown, composed' },
  ],
  pages: [
    {
      narration: 'My name is Ada. I loved mathematics as a child.',
      shots: [
        { stage: 'child ~10', visual: 'A girl studies numbers by candlelight, close-up' },
        { stage: 'child ~10', visual: 'Wide shot of a grand study full of books' },
      ],
    },
    {
      narration: 'Later, I imagined machines that could compute.',
      shots: [{ stage: 'adult', visual: 'A woman sketches gears at a desk, medium shot' }],
    },
  ],
})

describe('parseBioPlan', () => {
  it('parses subject/style/stages and pages with shots, resolving stage ids', () => {
    const p = parseBioPlan('```json\n' + RAW_BIO + '\n```')
    expect(p.subject).toBe('Ada Lovelace')
    expect(p.style).toContain('painterly')
    expect(p.stages.map((s) => s.label)).toEqual(['child ~10', 'adult'])
    expect(p.stages[0].id).toBeTruthy()
    expect(p.pages).toHaveLength(2)
    expect(p.pages[0].index).toBe(1)
    expect(p.pages[1].index).toBe(2)
    expect(p.pages[0].shots).toHaveLength(2)
    // shot.stageId resolves to the matching stage's id (not the raw label)
    const childId = p.stages.find((s) => s.label === 'child ~10')!.id
    expect(p.pages[0].shots[0].stageId).toBe(childId)
    expect(p.pages[0].shots[0].visual).toContain('candlelight')
    expect(p.pages[0].shots[0].id).toBeTruthy()
  })

  it('drops shots without a visual, keeps a page only if it has shots, and throws when empty', () => {
    const raw = JSON.stringify({
      subject: 'X',
      style: 's',
      stages: [{ label: 'adult', appearance: 'a' }],
      pages: [
        { narration: 'n', shots: [{ stage: 'adult', visual: '' }, { stage: 'adult', visual: 'ok' }] },
        { narration: 'empty', shots: [{ stage: 'adult', visual: '' }] },
      ],
    })
    const p = parseBioPlan(raw)
    expect(p.pages).toHaveLength(1)
    expect(p.pages[0].shots).toHaveLength(1)
    expect(() => parseBioPlan(JSON.stringify({ subject: 'X', style: 's', stages: [], pages: [] }))).toThrow()
  })

  it('leaves stageId undefined for a shot with no/unknown stage', () => {
    const raw = JSON.stringify({
      subject: 'X',
      style: 's',
      stages: [{ label: 'adult', appearance: 'a' }],
      pages: [{ narration: 'n', shots: [{ visual: 'atmosphere only' }, { stage: 'ghost', visual: 'unknown stage' }] }],
    })
    const p = parseBioPlan(raw)
    expect(p.pages[0].shots[0].stageId).toBeUndefined()
    expect(p.pages[0].shots[1].stageId).toBeUndefined()
  })
})

describe('buildBioPrompt', () => {
  it('includes the subject, orientation and narration language, and NOT a target length', () => {
    const b: Brief = { idea: 'Ada Lovelace, pioneer of computing', durationSec: 40, language: 'EN', speakers: 'auto', genre: '', aspect: 'portrait', type: 'biography', shotSec: 6 }
    const out = buildBioPrompt(b)
    expect(out).toContain('Ada Lovelace')
    expect(out.toLowerCase()).toContain('portrait')
    expect(out).toContain('English')
    expect(out).not.toMatch(/target (total )?length/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/studio/plan.test.ts`
Expected: FAIL — `parseBioPlan`/`buildBioPrompt` are not exported.

- [ ] **Step 3: Add the biography guide to `guide.ts`**

Append to `src/services/studio/guide.ts`:

```ts
/**
 * System prompt for BIOGRAPHY mode: the LLM turns a subject into a page-by-page breakdown
 * of short SILENT shots. Narration is written for the user to voice EXTERNALLY — it is never
 * sent to the video model.
 */
export const BIOGRAPHY_GUIDE = `You are a director of short biographical films. You turn a brief about a real or historical person into a production-ready plan of narrated PAGES made of short SILENT shots. The video model renders visuals only; the narration is voiced separately by the user, so never rely on characters speaking on screen.

# Structure
- Produce a "subject" (the person) and a single global "style" line — a concrete visual style (e.g. "painterly educational animation, cinematic camera movement, warm emotional lighting, no readable text, no logos") applied to EVERY shot for visual cohesion.
- Split the subject's life into a small set of "stages" (2-4), each with a "label" that includes an approximate age (e.g. "child ~10", "teen ~15", "adult") and an "appearance" describing that stage's look (age, build, hair, clothing, distinctive features). One consistent look per stage — reused across every shot of that stage.
- Write "pages" that tell the life story in order. Each page has:
  - "narration": a first-person or narrator script (a few short sentences) — the words the user will voice.
  - "shots": 2-3 shots, each a concrete "visual" (setting, framing, camera move, lighting, action) tagged with the "stage" it depicts (use the stage's exact label). Use no stage for pure-atmosphere shots (landscapes, objects).
- Decide the natural number of pages for the life story — do NOT pad to a fixed length.

# Rules
- Shots are SILENT — describe visuals only, never dialogue or on-screen speech.
- Do NOT specify shot durations; the app applies a uniform duration.
- No readable text, subtitles, or real brand/club logos in any shot.
- Keep the same person visually consistent across stages via the stage appearance descriptions.`

/** Strict JSON output contract for biography mode. Matches the BiographyPlan type. */
export const BIO_OUTPUT_DIRECTIVE = `

# OUTPUT
Return ONLY a single JSON object, no markdown fences, no commentary. Schema:
{
  "subject": string,
  "style": string,
  "stages": [ { "label": string, "appearance": string } ],
  "pages": [ { "narration": string, "shots": [ { "stage": string, "visual": string } ] } ]
}
Rules:
- Each shot's "stage" MUST exactly match one of stages[].label (or be omitted for atmosphere shots).
- Every shot needs a concrete "visual". Every page needs at least one shot.
- Do NOT include durations or spoken dialogue anywhere.`
```

- [ ] **Step 4: Add the biography planner to `plan.ts`**

In `src/services/studio/plan.ts`, update the imports and append the new functions. Change the type import line and the guide import line to:

```ts
import type { Brief, BiographyPlan, BioPage, BioShot, BioStage, Plan, Scene } from '@/lib/types'
import { DIRECTOR_GUIDE, OUTPUT_DIRECTIVE, BIOGRAPHY_GUIDE, BIO_OUTPUT_DIRECTIVE } from './guide'
```

Then append at the end of the file:

```ts
export function buildBioPrompt(b: Brief): string {
  const genre = b.genre.trim() ? `Style hint: ${b.genre.trim()}.` : ''
  return [
    `Subject: ${b.idea.trim()}`,
    `Narration language: ${b.language === 'ZH' ? 'Chinese' : 'English'}.`,
    `Orientation: ${b.aspect === 'portrait' ? 'portrait (9:16)' : 'landscape (16:9)'}.`,
    genre,
    `Plan this person's biography as narrated pages of short silent shots, following all the rules.`,
  ]
    .filter(Boolean)
    .join('\n')
}

interface RawBioPlan {
  subject?: string
  style?: string
  stages?: { label?: string; appearance?: string }[]
  pages?: { narration?: string; shots?: { stage?: string; visual?: string }[] }[]
}

export function parseBioPlan(text: string): BiographyPlan {
  const raw = JSON.parse(extractJson(text)) as RawBioPlan
  if (!Array.isArray(raw.stages) || !Array.isArray(raw.pages)) {
    throw new Error('LLM biography plan missing stages/pages.')
  }
  const stages: BioStage[] = raw.stages
    .filter((s) => s.label && s.appearance)
    .map((s) => ({ id: uid(), label: s.label!.trim(), appearance: s.appearance!.trim() }))
  const idByLabel = new Map(stages.map((s) => [s.label.toLowerCase(), s.id]))

  const pages: BioPage[] = []
  for (const p of raw.pages) {
    const shots: BioShot[] = (p.shots ?? [])
      .filter((sh) => sh.visual && sh.visual.trim())
      .map((sh) => {
        const stageId = sh.stage ? idByLabel.get(sh.stage.trim().toLowerCase()) : undefined
        return { id: uid(), visual: sh.visual!.trim(), ...(stageId ? { stageId } : {}) }
      })
    if (!shots.length) continue
    pages.push({ id: uid(), index: pages.length + 1, narration: (p.narration ?? '').trim(), shots })
  }
  if (!pages.length) throw new Error('LLM biography plan has no shots.')
  return { subject: (raw.subject ?? 'Subject').trim(), style: (raw.style ?? '').trim(), stages, pages }
}

/** Call the LLM and parse a BiographyPlan. Retries once with a stricter JSON nudge. */
export async function makeBioPlan(brief: Brief, model: string, opts: RunOptions = {}): Promise<BiographyPlan> {
  const userPrompt = buildBioPrompt(brief)
  const systemBase = BIOGRAPHY_GUIDE + BIO_OUTPUT_DIRECTIVE
  const attempt = async (extra = '') =>
    parseBioPlan(
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

(`extractJson`, `llmText`, `RunOptions`, and `uid` are already imported/defined in `plan.ts`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/plan.test.ts`
Expected: PASS (existing story tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/services/studio/guide.ts src/services/studio/plan.ts src/services/studio/plan.test.ts
git commit -m "feat(plan): biography guide + makeBioPlan/parseBioPlan"
```

---

### Task 4: image — per-stage reference portrait + biography keyframe

**Files:**
- Modify: `src/services/studio/image.ts`
- Test: `src/services/studio/image.test.ts`

**Interfaces:**
- Consumes: `nanoBanana`, `uid`, `BioStage`, `CharacterImage` (Task 1).
- Produces: `buildStageImagePrompt(subject, stage, style): string`, `mintStageImage(subject, stage, style): Promise<CharacterImage>`, `buildBioKeyframePrompt(visual, style, aspect?): string`, `bioKeyframe(visual, stageImageUrls, style, aspect?): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Append to `src/services/studio/image.test.ts`. Extend the existing `./image` import to include `buildStageImagePrompt, buildBioKeyframePrompt` (e.g. `import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from './image'`) and add `import type { BioStage } from '@/lib/types'`. Then add:

```ts
describe('biography image prompts', () => {
  it('embeds subject, stage label/appearance and global style in the portrait prompt', () => {
    const stage: BioStage = { id: '1', label: 'child ~10', appearance: 'young girl, curls' }
    const p = buildStageImagePrompt('Ada Lovelace', stage, 'painterly educational animation')
    expect(p).toContain('Ada Lovelace')
    expect(p).toContain('child ~10')
    expect(p).toContain('young girl, curls')
    expect(p).toContain('painterly educational animation')
  })

  it('embeds the visual, style and orientation ratio in the keyframe prompt', () => {
    const p = buildBioKeyframePrompt('A girl studies by candlelight', 'warm cinematic style', 'portrait')
    expect(p).toContain('A girl studies by candlelight')
    expect(p).toContain('warm cinematic style')
    expect(p).toContain('9:16')
    expect(buildBioKeyframePrompt('x', 'y', 'landscape')).toContain('16:9')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/services/studio/image.test.ts`
Expected: FAIL — `buildStageImagePrompt`/`buildBioKeyframePrompt` not exported.

- [ ] **Step 3: Implement**

In `src/services/studio/image.ts`, change the type import to include `BioStage`:

```ts
import type { BioStage, Character, CharacterImage, Scene } from '@/lib/types'
```

Then append:

```ts
/** Prompt for a subject's reference portrait at one life stage (style-consistent). */
export function buildStageImagePrompt(subject: string, stage: BioStage, style: string): string {
  const look = stage.appearance.trim() || 'a distinctive person'
  const styleLine = style.trim() ? ` Style: ${style.trim()}.` : ''
  return `Character reference portrait of ${subject} as ${stage.label}: ${look}.${styleLine} Centered, clear face, neutral plain background, consistent art style, full head-and-shoulders framing.`
}

/** Mint one reference portrait for a subject's life stage. Named "<subject> — <stage label>". */
export async function mintStageImage(subject: string, stage: BioStage, style: string): Promise<CharacterImage> {
  const { url } = await nanoBanana({ prompt: buildStageImagePrompt(subject, stage, style), aspectRatio: '1:1' })
  return { id: uid(), name: `${subject} — ${stage.label}`, url, source: 'minted', createdAt: Date.now() }
}

/** Prompt for a biography shot keyframe, embedding the global style. */
export function buildBioKeyframePrompt(visual: string, style: string, aspect: 'landscape' | 'portrait' = 'landscape'): string {
  const ratio = aspect === 'portrait' ? '9:16' : '16:9'
  const styleLine = style.trim() ? ` Style: ${style.trim()}.` : ''
  return `Cinematic establishing frame, ${ratio}.${styleLine} ${visual.trim()}. Cohesive lighting and composition, no text or watermark.`
}

/** Generate a biography shot keyframe, conditioned on the stage portrait when provided. */
export async function bioKeyframe(
  visual: string,
  stageImageUrls: string[],
  style: string,
  aspect: 'landscape' | 'portrait' = 'landscape',
): Promise<string> {
  const { url } = await nanoBanana({
    prompt: buildBioKeyframePrompt(visual, style, aspect),
    aspectRatio: aspect === 'portrait' ? '9:16' : '16:9',
    ...(stageImageUrls.length ? { imageUrls: stageImageUrls } : {}),
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
git commit -m "feat(image): per-stage reference portrait + biography keyframe"
```

---

### Task 5: video + generate — silent biography render + orchestration

**Files:**
- Modify: `src/services/studio/video.ts`
- Modify: `src/services/studio/generate.ts`
- Test: `src/services/studio/generate.test.ts`

**Interfaces:**
- Consumes: `nativeVideo`, `VideoModelId`, `QueuePhase` (client); `bioKeyframe`, `mintStageImage` (Task 4); `BiographyPlan`, `BioShot`, `CharacterImage`, `GenerateCallbacks` (Tasks 1, existing).
- Produces (video.ts): `buildBioVideoPrompt(style, visual): string`, `GenerateBioShotArgs`, `generateBioShotVideo(args, onPhase?): Promise<{url:string}>`.
- Produces (generate.ts): `BioClipArgs`, `generateBioShot(args, cb?): Promise<{url:string}>`, `generateBiography(plan, args, cb): Promise<void>` where `args = { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape'|'portrait'; shotSec: number }`.

- [ ] **Step 1: Add the silent render helpers to `video.ts`**

Append to `src/services/studio/video.ts` (imports `getVideoModel`, `nativeVideo`, `QueuePhase`, `VideoModelId` are already present):

```ts
/** Compose a biography shot's silent prompt: global style + the shot's visual (no dialogue). */
export function buildBioVideoPrompt(style: string, visual: string): string {
  return [style.trim(), visual.trim()].filter(Boolean).join('\n')
}

export interface GenerateBioShotArgs {
  model: VideoModelId
  style: string
  visual: string
  keyframeUrl: string
  durationSec: number
  aspect: 'landscape' | 'portrait'
}

/** Generate one SILENT biography shot video (audio forced off on any model). */
export async function generateBioShotVideo(
  args: GenerateBioShotArgs,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  const prompt = buildBioVideoPrompt(args.style, args.visual)
  return nativeVideo(
    {
      model: args.model,
      prompt,
      startImageUrl: args.keyframeUrl,
      durationSec: args.durationSec,
      aspect: args.aspect,
      forceSilent: true,
    },
    onPhase ? { onProgress: onPhase } : {},
  )
}
```

(`getVideoModel` remains imported for the existing story path; leave it.)

- [ ] **Step 2: Add biography orchestration to `generate.ts`**

In `src/services/studio/generate.ts`, update the imports:

```ts
import { bioKeyframe, mintCharacterImage, mintStageImage, sceneKeyframe } from './image'
import { generateBioShotVideo, generateSceneVideo } from './video'
import type { BiographyPlan, BioShot, CharacterImage, Plan, Scene } from '@/lib/types'
```

Then append:

```ts
export interface BioClipArgs {
  shot: BioShot
  /** stageId → minted portrait URL. */
  stageImageById: Map<string, string>
  style: string
  videoModel: VideoModelId
  aspect: 'landscape' | 'portrait'
  shotSec: number
}

/** Render one biography shot: stage-conditioned keyframe → silent video. Reused by run + regen. */
export async function generateBioShot(
  args: BioClipArgs,
  cb: Pick<GenerateCallbacks, 'onKeyframe' | 'onScenePhase'> = {},
): Promise<{ url: string }> {
  const stageUrl = args.shot.stageId ? args.stageImageById.get(args.shot.stageId) : undefined
  const keyframe = await bioKeyframe(args.shot.visual, stageUrl ? [stageUrl] : [], args.style, args.aspect)
  cb.onKeyframe?.(args.shot.id, keyframe)
  return generateBioShotVideo(
    {
      model: args.videoModel,
      style: args.style,
      visual: args.shot.visual,
      keyframeUrl: keyframe,
      durationSec: args.shotSec,
      aspect: args.aspect,
    },
    (p) => cb.onScenePhase?.(args.shot.id, p),
  )
}

/**
 * Full biography pipeline: mint any missing per-stage reference portraits (reuse the library
 * by "<subject> — <stage label>"), then render every shot (silent) in page order.
 */
export async function generateBiography(
  plan: BiographyPlan,
  args: { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape' | 'portrait'; shotSec: number },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const libByName = new Map<string, string>()
  for (const img of args.characterLibrary ?? []) libByName.set(img.name.toLowerCase(), img.url)

  const stageImageById = new Map<string, string>()
  for (const stage of plan.stages) {
    const name = `${plan.subject} — ${stage.label}`
    const existing = libByName.get(name.toLowerCase())
    if (existing) {
      stageImageById.set(stage.id, existing)
      continue
    }
    try {
      const img = await mintStageImage(plan.subject, stage, plan.style)
      cb.onCharacterImage?.(img)
      stageImageById.set(stage.id, img.url)
    } catch (e) {
      cb.onError?.(`image:${name}`, e instanceof Error ? e.message : String(e))
    }
  }

  for (const page of plan.pages) {
    for (const shot of page.shots) {
      cb.onSceneStart?.(shot.id)
      try {
        const r = await generateBioShot(
          { shot, stageImageById, style: plan.style, videoModel: args.videoModel, aspect: args.aspect, shotSec: args.shotSec },
          cb,
        )
        cb.onScene?.(shot.id, r)
      } catch (e) {
        cb.onError?.(`scene:${shot.id}`, e instanceof Error ? e.message : String(e))
      }
    }
  }
}
```

- [ ] **Step 3: Add the biography orchestration test**

Append to `src/services/studio/generate.test.ts`. The existing file mocks `./image` and `./video`; extend BOTH mocks to also export the biography helpers, then add a describe block. Replace the two `vi.mock(...)` calls at the top of the file with:

```ts
vi.mock('./image', () => ({
  mintCharacterImage: vi.fn(async (c: { name: string }) => ({ id: c.name, name: c.name, url: `img:${c.name}`, source: 'minted', createdAt: 0 })),
  sceneKeyframe: vi.fn(async () => 'keyframe-url'),
  mintStageImage: vi.fn(async (subject: string, stage: { label: string }) => ({ id: `${subject}-${stage.label}`, name: `${subject} — ${stage.label}`, url: `img:${subject}:${stage.label}`, source: 'minted', createdAt: 0 })),
  bioKeyframe: vi.fn(async () => 'bio-keyframe-url'),
}))
vi.mock('./video', () => ({
  generateSceneVideo: vi.fn(async () => ({ url: 'video-url' })),
  generateBioShotVideo: vi.fn(async () => ({ url: 'bio-video-url' })),
}))
```

Extend the existing static imports (do NOT add duplicate imports from a module already imported): change `import { generateFromPlan } from './generate'` → `import { generateFromPlan, generateBiography } from './generate'`. Because `./image` and `./video` are `vi.mock`ed, import the mocked helpers you assert on from them at the top: add `import { mintCharacterImage, sceneKeyframe, mintStageImage, bioKeyframe } from './image'` and `import { generateSceneVideo, generateBioShotVideo } from './video'` — reuse/extend whatever import lines the existing test already has for these modules rather than duplicating them. Add `import type { BiographyPlan } from '@/lib/types'`. Then append this describe block:

```ts
const bioPlan: BiographyPlan = {
  subject: 'Ada',
  style: 'painterly',
  stages: [
    { id: 'st1', label: 'child ~10', appearance: 'young' },
    { id: 'st2', label: 'adult', appearance: 'grown' },
  ],
  pages: [
    { id: 'p1', index: 1, narration: 'n1', shots: [{ id: 's1', stageId: 'st1', visual: 'v1' }, { id: 's2', stageId: 'st1', visual: 'v2' }] },
    { id: 'p2', index: 2, narration: 'n2', shots: [{ id: 's3', stageId: 'st2', visual: 'v3' }] },
  ],
}

describe('generateBiography', () => {
  it('mints only missing stage portraits and renders each shot silently', async () => {
    const done: string[] = []
    await generateBiography(
      bioPlan,
      { characterLibrary: [{ id: 'x', name: 'Ada — child ~10', url: 'lib:child', source: 'uploaded', createdAt: 0 }], videoModel: 'bytedance/seedance-2.0/image-to-video', aspect: 'landscape', shotSec: 6 },
      { onScene: (id) => done.push(id) },
    )
    // "child ~10" is in the library; only "adult" is minted.
    expect((mintStageImage as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].label)).toEqual(['adult'])
    expect(bioKeyframe).toHaveBeenCalledTimes(3)
    expect(generateBioShotVideo).toHaveBeenCalledTimes(3)
    expect(done).toEqual(['s1', 's2', 's3'])
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/services/studio/generate.test.ts`
Expected: PASS (existing story `generateFromPlan` test still green; only "adult" minted, 3 keyframes + 3 videos, `onScene` fired for s1/s2/s3).

- [ ] **Step 5: Commit**

```bash
git add src/services/studio/video.ts src/services/studio/generate.ts src/services/studio/generate.test.ts
git commit -m "feat(generate): silent biography render + generateBiography orchestration"
```

---

### Task 6: cost — biography estimate

**Files:**
- Modify: `src/lib/cost.ts`
- Test: `src/lib/cost.test.ts`

**Interfaces:**
- Consumes: `BiographyPlan` (Task 1), `getVideoModel`.
- Produces: `estimateBioCost(plan: BiographyPlan, videoModel: string, shotSec: number): number`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cost.test.ts`. Extend the existing `./cost` import to include `estimateBioCost` (e.g. `import { estimatePlanCost, clipCost, formatUSD, estimateBioCost } from './cost'`) and the existing `./types` type import to include `BiographyPlan`. Then add:

```ts
const bioPlan: BiographyPlan = {
  subject: 'Ada',
  style: 's',
  stages: [
    { id: 'a', label: 'child', appearance: 'x' },
    { id: 'b', label: 'adult', appearance: 'y' },
  ],
  pages: [
    { id: 'p1', index: 1, narration: 'n', shots: [{ id: 's1', visual: 'v' }, { id: 's2', visual: 'v' }] },
    { id: 'p2', index: 2, narration: 'n', shots: [{ id: 's3', visual: 'v' }] },
  ],
}

describe('estimateBioCost', () => {
  it('= stages*IMAGE_EACH + totalShots*shotSec*pricePerSec', () => {
    const m = getVideoModel('fal-ai/veo3.1/image-to-video')
    const est = estimateBioCost(bioPlan, m.id, 6)
    const IMAGE_EACH = 0.039
    const images = 2 * IMAGE_EACH // 2 stages
    const video = 3 * 6 * m.pricePerSec // 3 shots
    expect(est).toBeCloseTo(images + video, 5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: FAIL — `estimateBioCost` not exported.

- [ ] **Step 3: Implement**

In `src/lib/cost.ts`, change the type import to include `BiographyPlan`:

```ts
import type { BiographyPlan, Plan } from './types'
```

Then append (before `formatUSD`):

```ts
/** Cost estimate for a biography: one portrait per stage + each shot's silent video. */
export function estimateBioCost(plan: BiographyPlan, videoModel: string, shotSec: number): number {
  const shots = plan.pages.reduce((n, p) => n + p.shots.length, 0)
  const images = plan.stages.length * IMAGE_EACH
  const video = shots * shotSec * getVideoModel(videoModel).pricePerSec
  return images + video
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cost.ts src/lib/cost.test.ts
git commit -m "feat(cost): biography cost estimate"
```

---

### Task 7: store — biography run/regen, bioPlan state, brief.type/shotSec, sessions

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: `makeBioPlan` (Task 3), `generateBiography`, `generateBioShot` (Task 5), `BiographyPlan`, revised `Brief`/`Session` (Task 1).
- Produces: store field `bioPlan: BiographyPlan | null`; `runStudio`/`regenScene` branch on `brief.type`; sessions persist `bioPlan`.

- [ ] **Step 1: Replace `src/store/useStore.ts` with the biography-aware store**

Replace the full contents of `src/store/useStore.ts` with:

```ts
import { create } from 'zustand'
import { uid, sessionTitle } from '@/lib/utils'
import { mapFalError } from '@/services/fal/errors'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL, type VideoModelId } from '@/services/fal/client'
import { makePlan, makeBioPlan } from '@/services/studio/plan'
import { generateFromPlan, generateSceneClip, generateBiography, generateBioShot } from '@/services/studio/generate'
import type { Brief, Clip, CharacterImage, BiographyPlan, Plan, Session, StudioStatus } from '@/lib/types'

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
  type: 'story',
  shotSec: 8,
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
  bioPlan: BiographyPlan | null
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
  videoModel: _active0?.videoModel ?? localStorage.getItem(VIDEO_MODEL_KEY) ?? DEFAULT_VIDEO_MODEL,
  brief: _active0 ? _active0.brief : DEFAULT_BRIEF,
  characterLibrary: loadCharacterLibrary(),

  sessions: _sessions0,
  activeSessionId: _active0 ? _activeId0 : null,

  plan: _active0?.plan ?? null,
  bioPlan: _active0?.bioPlan ?? null,
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
      bioPlan: null,
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
        ? { ...x, brief: s.brief, plan: s.plan, bioPlan: s.bioPlan, category: s.category, clips: s.clips, videoModel: s.videoModel, updatedAt: Date.now() }
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
    set({ activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null })
  },

  loadSession: (id) => {
    const sess = get().sessions.find((x) => x.id === id)
    if (!sess) return
    localStorage.setItem(ACTIVE_KEY, id)
    set({
      activeSessionId: id,
      brief: sess.brief,
      plan: sess.plan,
      bioPlan: sess.bioPlan ?? null,
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
        return { sessions: next, activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null }
      }
      return { sessions: next }
    }),

  clearResults: () => set({ plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null }),

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

    const patchClipByScene = (sceneId: string, patch: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...patch } : c)) }))

    if (brief.type === 'biography') {
      set({ status: 'planning', currentStep: 'Planning biography…', plan: null, bioPlan: null, clips: [] })
      let bio: BiographyPlan
      try {
        bio = await makeBioPlan(brief, model)
      } catch (e) {
        const fe = mapFalError(e)
        set({ status: 'error', currentStep: null })
        get().toast({ kind: 'error', title: fe.title, message: fe.message })
        return
      }
      const clips: Clip[] = bio.pages.flatMap((page) =>
        page.shots.map((shot, i) => ({
          id: uid(),
          sceneId: shot.id,
          title: `Page ${page.index} · Shot ${i + 1}`,
          speakers: [],
          prompt: shot.visual,
          status: 'pending' as const,
        })),
      )
      set({ bioPlan: bio, category: 'Biography', clips, status: 'generating' })
      get().saveActiveSession()

      await generateBiography(
        bio,
        { characterLibrary: get().characterLibrary, videoModel: videoModel as VideoModelId, aspect: brief.aspect, shotSec: brief.shotSec },
        {
          onCharacterImage: (img) => get().addCharacterImage(img),
          onSceneStart: (sceneId) => {
            set({ currentStep: 'Generating shot…' })
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
      return
    }

    // story
    set({ status: 'planning', currentStep: 'Planning shots…', plan: null, bioPlan: null, clips: [] })
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
    const { plan, bioPlan, characterLibrary, brief, videoModel } = get()
    const patch = (p: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...p } : c)) }))

    if (brief.type === 'biography' && bioPlan) {
      const shot = bioPlan.pages.flatMap((pg) => pg.shots).find((sh) => sh.id === sceneId)
      if (!shot) return
      patch({ status: 'running', error: undefined, videoUrl: undefined, imageUrl: undefined, phase: undefined })
      try {
        const libByName = new Map<string, string>()
        for (const img of characterLibrary) libByName.set(img.name.toLowerCase(), img.url)
        const stageImageById = new Map<string, string>()
        for (const stage of bioPlan.stages) {
          const url = libByName.get(`${bioPlan.subject} — ${stage.label}`.toLowerCase())
          if (url) stageImageById.set(stage.id, url)
        }
        const r = await generateBioShot(
          { shot, stageImageById, style: bioPlan.style, videoModel: videoModel as VideoModelId, aspect: brief.aspect, shotSec: brief.shotSec },
          { onKeyframe: (_id, url) => patch({ imageUrl: url }), onScenePhase: (_id, phase) => patch({ phase }) },
        )
        patch({ status: 'done', videoUrl: r.url })
      } catch (e) {
        const fe = mapFalError(e)
        patch({ status: 'error', error: fe.message })
        get().toast({ kind: 'error', title: fe.title, message: fe.message })
      }
      get().saveActiveSession()
      return
    }

    if (!plan) return
    const scene = plan.scenes.find((s) => s.id === sceneId)
    if (!scene) return
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

- [ ] **Step 2: Verify the store typechecks (UI errors expected)**

Run: `pnpm typecheck 2>&1 | grep 'store/useStore.ts'`
Expected: NO output. (Store test files `useStore.test.ts`/`useStore.run-session.test.ts` may now error because `Brief`/`Session` gained required `type`/`shotSec`/`bioPlan` — those are fixed in Task 10. UI errors in BriefForm/Studio are expected until Tasks 8-9.)

- [ ] **Step 3: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(store): biography run/regen + bioPlan state + session persistence"
```

---

### Task 8: UI — BriefForm content-type toggle + biography fields

**Files:**
- Modify: `src/components/BriefForm.tsx`

**Interfaces:**
- Consumes: store `brief` (with `type`/`shotSec`), `setBrief`, `runStudio`; `VideoModelPicker`.

- [ ] **Step 1: Rewrite `BriefForm.tsx`**

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

const STORY_EXAMPLES = [
  'A cartoon fox discovers a glowing lamp in a moonlit forest and gasps in wonder.',
  'A tense noir detective confronts a suspect in a rain-soaked alley at midnight.',
  'A 15-second upbeat advertisement for a fictional artisan coffee brand.',
  'A sci-fi pilot warns her crew as alarms flash across the cockpit.',
]
const BIO_EXAMPLES = [
  'Cristiano Ronaldo — from a small island to football stardom.',
  'Ada Lovelace, pioneer of computing.',
  'Marie Curie and her discovery of radioactivity.',
  'Nikola Tesla and the age of electricity.',
]

export function BriefForm() {
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const run = useStore((s) => s.runStudio)
  const status = useStore((s) => s.status)
  const hasKey = useStore((s) => !!s.key)
  const busy = status === 'planning' || status === 'generating'
  const isBio = brief.type === 'biography'
  const examples = isBio ? BIO_EXAMPLES : STORY_EXAMPLES

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Content type</Label>
        <Select value={brief.type} onValueChange={(v) => setBrief({ type: v as 'story' | 'biography' })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="biography">Biography</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="idea">{isBio ? 'Who? (subject + focus)' : 'Brief'}</Label>
        <Textarea
          id="idea"
          rows={5}
          placeholder={isBio ? 'A person to tell the life story of…' : 'Describe the video you want…'}
          value={brief.idea}
          onChange={(e) => setBrief({ idea: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
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
        {isBio ? (
          <div className="space-y-2">
            <Label>Shot duration</Label>
            <Select value={String(brief.shotSec)} onValueChange={(v) => setBrief({ shotSec: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4s</SelectItem>
                <SelectItem value="6">6s</SelectItem>
                <SelectItem value="8">8s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="space-y-2">
          <Label>{isBio ? 'Narration language' : 'Language'}</Label>
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
            value={brief.aspect ?? 'landscape'}
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
          <Label htmlFor="genre">{isBio ? 'Style hint' : 'Genre hint'}</Label>
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
        {busy ? 'Generating…' : hasKey ? (isBio ? 'Generate biography' : 'Generate video') : 'Add key & generate'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify BriefForm typechecks**

Run: `pnpm typecheck 2>&1 | grep 'BriefForm.tsx'`
Expected: NO output. (Studio.tsx errors are expected until Task 9.)

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefForm.tsx
git commit -m "feat(ui): BriefForm content-type toggle + biography fields"
```

---

### Task 9: UI — Studio page-grouped biography results + narration copy

**Files:**
- Modify: `src/screens/Studio.tsx`

**Interfaces:**
- Consumes: store `bioPlan`, `brief`, `videoModel`, `clips`; `estimateBioCost`/`estimatePlanCost`; `ClipCard`.

- [ ] **Step 1: Rewrite `Studio.tsx`**

Replace the full contents of `src/screens/Studio.tsx` with:

```tsx
import { useState } from 'react'
import { Clapperboard, Loader2, Menu, Copy } from 'lucide-react'
import { Badge, Button, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { CharacterLibraryPanel } from '@/components/CharacterLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { SessionSidebar } from '@/components/SessionSidebar'
import { useStore } from '@/store/useStore'
import { estimateBioCost, estimatePlanCost, formatUSD } from '@/lib/cost'
import { cn } from '@/lib/utils'
import type { Clip } from '@/lib/types'

export function Studio() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)
  const plan = useStore((s) => s.plan)
  const bioPlan = useStore((s) => s.bioPlan)
  const brief = useStore((s) => s.brief)
  const videoModel = useStore((s) => s.videoModel)

  const clipByScene = new Map<string, Clip>(clips.map((c) => [c.sceneId, c]))
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {})

  const estCost = bioPlan
    ? estimateBioCost(bioPlan, videoModel, brief.shotSec)
    : plan
      ? estimatePlanCost(plan, videoModel)
      : null

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
                {estCost != null && (
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    Est. cost: {formatUSD(estCost)}
                  </span>
                )}
              </div>
            )}

            {status === 'idle' && clips.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                <Clapperboard className="size-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Describe a video on the left and hit Generate.</p>
                <p className="text-xs mt-1">
                  Story mode renders multi-character shots with native audio; Biography mode renders silent shots of a
                  person's life — add your narration afterward.
                </p>
              </div>
            ) : bioPlan ? (
              <>
                <div className="flex items-center justify-between">
                  <Separator className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 shrink-0"
                    onClick={() => copy(bioPlan.pages.map((p) => p.narration).join('\n\n'))}
                  >
                    <Copy className="size-4" /> Copy full script
                  </Button>
                </div>
                {bioPlan.pages.map((page) => (
                  <div key={page.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">Page {page.index}</span>
                      <p className="text-sm text-foreground/90 flex-1 whitespace-pre-wrap">{page.narration}</p>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copy(page.narration)}>
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {page.shots.map((shot) => {
                        const c = clipByScene.get(shot.id)
                        return c ? <ClipCard key={shot.id} clip={c} /> : null
                      })}
                    </div>
                  </div>
                ))}
              </>
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

- [ ] **Step 2: Verify Studio typechecks**

Run: `pnpm typecheck 2>&1 | grep 'Studio.tsx'`
Expected: NO output. (Only the store test files may still error — fixed in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/Studio.tsx
git commit -m "feat(ui): page-grouped biography results + narration copy"
```

---

### Task 10: Verification — store tests, typecheck, lint, full suite, build

**Files:**
- Modify: `src/store/useStore.test.ts`, `src/store/useStore.run-session.test.ts` (only to satisfy the new required `Brief`/`Session` fields).

- [ ] **Step 1: Fix the store test fixtures for the new required fields**

Run `pnpm typecheck` and inspect errors in `src/store/useStore.test.ts` and `src/store/useStore.run-session.test.ts`. They fail because `Brief` now requires `type` and `shotSec`, and `Session` requires `bioPlan`. For every `Brief` object literal in those tests, add `type: 'story'` and `shotSec: 8`; for every `Session` object literal (or `saveActiveSession`/session fixture) add `bioPlan: null`. Do NOT change any assertions or test intent — only add the new required fields so the existing behavior is still exercised. If a test spreads `DEFAULT_BRIEF`/an existing brief from the store, no change is needed there.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no new errors (fix any unused-import warnings introduced by the edits).

- [ ] **Step 4: Full test suite**

Run: `pnpm test:run`
Expected: all pass — the biography additions (`plan.test.ts`, `image.test.ts`, `generate.test.ts`, `cost.test.ts`, `client.test.ts`) plus the untouched story tests.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: `tsc -b` + `vite build` succeed, `dist/` emitted.

- [ ] **Step 6: Manual smoke (note only — no key in CI)**

The live check remains a manual user step: `pnpm dev`, enter a fal key, switch content type to **Biography**, enter a subject (e.g. "Cristiano Ronaldo"), pick a shot duration, Generate. Verify: a page-grouped result appears with narration text + copy buttons; a reference portrait mints per life stage; each shot renders a **silent** video; regenerate re-renders one shot; est-cost shows. Report that this step is pending a real key.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: satisfy Brief/Session new fields; verify biography mode green"
```

---

## Notes for the implementer

- **Silent is enforced two ways:** `generateBioShotVideo` passes `forceSilent: true` (so `generate_audio:false` on every model) AND `buildBioVideoPrompt` sends only style+visual (no narration). Never thread `page.narration` into a model prompt.
- **Stage reuse key** is exactly `"${subject} — ${stage.label}"` (em-dash with surrounding spaces), lowercased for matching — keep it identical in `mintStageImage` (Task 4), `generateBiography` (Task 5), and `regenScene` (Task 7) or reuse breaks.
- **Existing story path is untouched** behaviorally: the store branches on `brief.type`, and `type` defaults to `'story'`.
