# Backend Migration — Plan 3: Server Pipeline API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the generation pipeline server-side and expose it as `/api/*` routes that run on Cloudflare Workers: an LLM plan call, plus an async, queue-based generation flow (fal `queue.submit` → poll `queue.status` → `queue.result`) that persists to Supabase and uploads finished media to S3. The fal key never reaches the browser.

**Architecture:** The existing `fal.subscribe` (blocking submit→poll→result in one call) is replaced by a server fal wrapper over `fal.queue.*`. Generation is modeled as a **per-clip state machine** persisted in the `clips`/`character_library` rows: the client submits a job then polls one endpoint per clip; the server advances the machine on each poll (keyframe done → upload to S3 → submit video; video done → upload → mark done). Story and biography share the machine, differing only in prompt builders and the silent-audio flag. The LLM plan call is short enough to run synchronously in `/api/plan`.

**Tech Stack:** `@fal-ai/client@1.10.1` (`fal.queue`), the Plan-2 Supabase repos + S3 wrapper, the existing pure pipeline helpers (`plan.ts`, `image.ts`, `video.ts`, `fal/client.ts` builders), Vitest.

## Global Constraints

- Runtime: Cloudflare Workers, `nodejs_compat`. All fal/DB/S3 I/O is fetch-based. `configureFal(FAL_KEY)` MUST run at the start of every request handler (the `@fal-ai/client` singleton is module-global and isolates don't reliably persist it).
- No request may block on a video job: video runs up to 10 min (`TIMEOUTS.video`). Only the LLM call (`/api/plan`) runs synchronously; every image/video job goes through `queue.submit` + client-polled `queue.status`.
- Reuse existing pure code — do NOT reimplement prompt/input construction or planning. Import `makePlan`/`makeBioPlan`/`parsePlan`/`parseBioPlan` (`src/services/studio/plan.ts`), the prompt builders (`src/services/studio/image.ts` + `video.ts`), and `buildVideoInput`/`getVideoModel`/`ENDPOINTS`/`MODELS`/`DEFAULT_MODEL`/`VIDEO_MODELS` (`src/services/fal/client.ts`). Where a needed helper is not currently exported, export it (Task 1) — do not copy it.
- fal call counts are fixed by the existing pipeline: **1 fal job per character/stage portrait** (nano-banana), **2 dependent jobs per scene/shot** (keyframe nano-banana → video; the video's `start image` is the keyframe output). Preserve this.
- Media in DB as S3 keys; the client receives presigned GET URLs. Keyframe/video jobs receive presigned S3 URLs as their input image URLs (fal fetches them).
- Domain-type imports inside `src/server/**` (incl. tests) are RELATIVE (`../../lib/types`), never `@/lib/types`. Imports of `src/services/**` from `src/server/**` are relative too (e.g. `../../services/studio/plan`).
- Auth: `middleware.ts` (Plan 1) already gates all `/api/*` except login. These routes assume an authenticated request; they read `FAL_KEY`/Supabase/S3 config from `process.env`.
- Every task ends green: its vitest passes AND `pnpm typecheck` + `pnpm build` + `pnpm next:build` exit 0.
- **Live verification is credential-gated.** Tasks marked *(live smoke)* require a real Supabase project + AWS S3 bucket + a fal key. Where those are unavailable at implementation time, land the code with its unit tests green and record the exact live-smoke steps as unchecked in the report; do NOT fake a live run.

## fal queue status → phase mapping (canonical, reused from the current `run()`)

`IN_QUEUE → 'queued'`, `IN_PROGRESS → 'running'`, `COMPLETED → 'done'`. A job that errors surfaces when `queue.result()` throws → route it through `mapFalError`.

## Per-clip state machine (the core design)

A `clips` row encodes its generation step by which fields are set:

| image_key | video_key | request_id | meaning |
|---|---|---|---|
| null | null | null | `pending` — not started |
| null | null | set | keyframe job in flight (`request_id` = keyframe job) |
| set | null | set | video job in flight (`request_id` = video job) |
| set | set | — | `done` |

`GET /api/status/clip/:id` advances it: check `queue.status(request_id)`; if not done, return the phase; if done, fetch `queue.result`, download the output, `putObject` to S3, then **either** (keyframe just finished) set `image_key` + submit the video job + store its `request_id`, **or** (video just finished) set `video_key` + `status='done'`. Characters use the same idea with a single step.

---

## File Structure

- `src/server/fal/queue.ts` — `configureFal(key)`, `submit(endpointId, input)`, `jobStatus(endpointId, requestId)`, `jobResult<T>(endpointId, requestId)`, plus `downloadToBytes(url)`.
- `src/server/pipeline/clips.ts` — pure `planToClips(sessionId, plan)` / `bioPlanToClips(sessionId, bioPlan)` building the `Clip[]` the store currently constructs in `runStudio`.
- `src/server/pipeline/inputs.ts` — pure builders assembling the fal `input` objects for each job kind (character mint, scene keyframe, scene video, bio keyframe, bio video), delegating to the imported prompt builders + `buildVideoInput`. Keeps route handlers thin and unit-testable.
- `src/server/pipeline/advance.ts` — the pure state-machine decision: given a clip/character row + a completed job's result + the S3/env deps, decide the next action (upload key, submit next, or done). Written so the branching is testable with fakes.
- `app/api/plan/route.ts` — `POST` brief → plan/bioPlan → persist → return.
- `app/api/generate/character/route.ts` — `POST` submit a character mint job.
- `app/api/generate/scene/route.ts` — `POST` submit a scene/shot keyframe job.
- `app/api/status/character/[id]/route.ts`, `app/api/status/clip/[id]/route.ts` — `GET` advance + report.
- `app/api/env.ts` — a tiny `readEnv()` returning the typed env bag (`FAL_KEY`, Supabase, S3) from `process.env`, throwing a named error on any missing value.
- Tests beside each `src/server/**` unit; route handlers verified by *(live smoke)* + the unit tests of the pure pieces they call.

> Exports needed from existing code (Task 1 adds any that are missing): from `src/services/studio/image.ts` — `buildCharacterImagePrompt`, `buildKeyframePrompt`, `buildStageImagePrompt`, `buildBioKeyframePrompt`; from `src/services/studio/video.ts` — `buildVideoPrompt`, `buildBioVideoPrompt`; from `src/services/studio/plan.ts` — `makePlan`, `makeBioPlan` (already exported). `buildVideoInput`/`getVideoModel`/`ENDPOINTS`/`DEFAULT_MODEL`/`VIDEO_MODELS` are already exported from `fal/client.ts`.

---

### Task 1: Export the reused pure builders

**Files:**
- Modify: `src/services/studio/image.ts`, `src/services/studio/video.ts` (add `export` to the named prompt builders if not already exported)
- Test: `src/server/pipeline/exports.test.ts` (a compile+call smoke that imports each builder and asserts it returns a non-empty string for sample input)

**Interfaces:**
- Produces: guaranteed `export`s of `buildCharacterImagePrompt(c: Character): string`, `buildKeyframePrompt(scene: Scene, aspect): string`, `buildStageImagePrompt(subject, stage, style): string`, `buildBioKeyframePrompt(visual, style, aspect): string`, `buildVideoPrompt(scene, voiceByName, audio: boolean): string`, `buildBioVideoPrompt(style, visual): string`. (Signatures per the current definitions — confirm exact params when exporting.)

- [ ] **Step 1: Find the current builders and their exact signatures**

Run: `pnpm vitest run --root . -t "__none__"` is not it — instead read the files:
Read `src/services/studio/image.ts` and `src/services/studio/video.ts`; note each builder's exact name, params, and whether it already has `export`. If a builder is currently a non-exported `function`/`const`, add `export`. Do NOT change their bodies.

- [ ] **Step 2: Write the failing test (verifies the exports exist and are callable)**

```ts
// src/server/pipeline/exports.test.ts
import { describe, it, expect } from 'vitest'
import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from '../../services/studio/image'
import { buildVideoPrompt, buildBioVideoPrompt } from '../../services/studio/video'
import type { Character, Scene, BioStage } from '../../lib/types'

describe('reused prompt builders are exported and callable', () => {
  const character: Character = { name: 'Robot', appearance: 'a tin robot', voice: 'metallic' }
  const scene: Scene = { id: 's1', title: 'T', speakers: ['Robot'], visual: 'robot waves', dialogue: 'Hi' }
  const stage: BioStage = { id: 'st1', label: 'child', appearance: 'young' }

  it('character/keyframe/stage/bio-keyframe prompts return non-empty strings', () => {
    expect(buildCharacterImagePrompt(character)).toBeTruthy()
    expect(buildKeyframePrompt(scene, 'landscape')).toBeTruthy()
    expect(buildStageImagePrompt('Ada', stage, 'watercolor')).toBeTruthy()
    expect(buildBioKeyframePrompt('a lab', 'watercolor', 'landscape')).toBeTruthy()
  })
  it('video prompts return non-empty strings', () => {
    expect(buildVideoPrompt(scene, new Map([['Robot', 'metallic']]), true)).toBeTruthy()
    expect(buildBioVideoPrompt('watercolor', 'a lab')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/server/pipeline/exports.test.ts`
Expected: FAIL — import errors for any builder not yet exported (or a signature mismatch to fix).

- [ ] **Step 4: Add the missing `export` keywords in image.ts/video.ts**

Add `export` to each named builder that the test imports. Adjust the test's argument shapes ONLY if the real signatures differ from the sample above (keep the assertions).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/server/pipeline/exports.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Full verification + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all exit 0). The Vite app must still build — exporting extra symbols is additive and safe.
```bash
git add src/services/studio/image.ts src/services/studio/video.ts src/server/pipeline/exports.test.ts
git commit -m "refactor(pipeline): export pure prompt builders for server reuse"
```

---

### Task 2: Env reader + server fal queue wrapper

**Files:**
- Create: `app/api/env.ts`, `src/server/fal/queue.ts`
- Test: `src/server/fal/queue.test.ts`

**Interfaces:**
- `readEnv(): { FAL_KEY: string; SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; AWS_ACCESS_KEY_ID: string; AWS_SECRET_ACCESS_KEY: string; S3_BUCKET: string; S3_REGION: string }` — from `process.env`; throws `Error('Missing env: <NAME>')` on the first empty value.
- `configureFal(key: string): void` — `fal.config({ credentials: key })`.
- `submit(endpointId: string, input: Record<string, unknown>): Promise<string>` — `fal.queue.submit` → `request_id`.
- `jobStatus(endpointId: string, requestId: string): Promise<{ raw: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED'; phase: 'queued'|'running'|'done' }>`.
- `jobResult<T>(endpointId: string, requestId: string): Promise<T>` — `fal.queue.result(...).data`.
- `downloadToBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }>` — `fetch` the fal output URL.

- [ ] **Step 1: Write the failing test (mock `@fal-ai/client`)**

```ts
// src/server/fal/queue.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const submitMock = vi.fn()
const statusMock = vi.fn()
const resultMock = vi.fn()
const configMock = vi.fn()
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: configMock,
    queue: {
      submit: (...a: unknown[]) => submitMock(...a),
      status: (...a: unknown[]) => statusMock(...a),
      result: (...a: unknown[]) => resultMock(...a),
    },
  },
}))

import { configureFal, submit, jobStatus, jobResult } from './queue'

beforeEach(() => { submitMock.mockReset(); statusMock.mockReset(); resultMock.mockReset(); configMock.mockReset() })

describe('server fal queue', () => {
  it('configureFal sets credentials', () => {
    configureFal('k')
    expect(configMock).toHaveBeenCalledWith({ credentials: 'k' })
  })
  it('submit returns the request_id', async () => {
    submitMock.mockResolvedValue({ request_id: 'req-1' })
    expect(await submit('ep', { a: 1 })).toBe('req-1')
    expect(submitMock).toHaveBeenCalledWith('ep', { input: { a: 1 } })
  })
  it('jobStatus maps the three states to phases', async () => {
    statusMock.mockResolvedValueOnce({ status: 'IN_QUEUE' })
    expect((await jobStatus('ep', 'r')).phase).toBe('queued')
    statusMock.mockResolvedValueOnce({ status: 'IN_PROGRESS' })
    expect((await jobStatus('ep', 'r')).phase).toBe('running')
    statusMock.mockResolvedValueOnce({ status: 'COMPLETED' })
    expect((await jobStatus('ep', 'r')).phase).toBe('done')
  })
  it('jobResult returns .data', async () => {
    resultMock.mockResolvedValue({ data: { video: { url: 'u' } }, requestId: 'r' })
    expect(await jobResult('ep', 'r')).toEqual({ video: { url: 'u' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/fal/queue.test.ts`
Expected: FAIL — cannot find module `./queue`.

- [ ] **Step 3: Write `queue.ts` and `env.ts`**

```ts
// src/server/fal/queue.ts
import { fal } from '@fal-ai/client'

export type Phase = 'queued' | 'running' | 'done'

export function configureFal(key: string): void {
  fal.config({ credentials: key })
}

export async function submit(endpointId: string, input: Record<string, unknown>): Promise<string> {
  const q = (await fal.queue.submit(endpointId, { input })) as { request_id: string }
  return q.request_id
}

export async function jobStatus(
  endpointId: string,
  requestId: string,
): Promise<{ raw: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'; phase: Phase }> {
  const s = (await fal.queue.status(endpointId, { requestId })) as { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' }
  const phase: Phase = s.status === 'IN_QUEUE' ? 'queued' : s.status === 'IN_PROGRESS' ? 'running' : 'done'
  return { raw: s.status, phase }
}

export async function jobResult<T>(endpointId: string, requestId: string): Promise<T> {
  const r = (await fal.queue.result(endpointId, { requestId })) as { data: T }
  return r.data
}

export async function downloadToBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return { bytes: await res.arrayBuffer(), contentType }
}
```

```ts
// app/api/env.ts
export interface AppEnv {
  FAL_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_REGION: string
}

const KEYS: (keyof AppEnv)[] = [
  'FAL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_REGION',
]

export function readEnv(): AppEnv {
  const out = {} as AppEnv
  for (const k of KEYS) {
    const v = process.env[k]
    if (!v) throw new Error(`Missing env: ${k}`)
    out[k] = v
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/fal/queue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full verification + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/fal/queue.ts app/api/env.ts src/server/fal/queue.test.ts
git commit -m "feat(pipeline): server fal queue wrapper + env reader"
```

---

### Task 3: Plan→clips builders + `POST /api/plan`

**Files:**
- Create: `src/server/pipeline/clips.ts`, `app/api/plan/route.ts`
- Test: `src/server/pipeline/clips.test.ts`

**Interfaces:**
- Consumes: `Plan`/`BiographyPlan`/`Clip` (`../../lib/types`).
- Produces (pure):
  - `planToClips(plan: Plan): Clip[]` — one `Clip` per `plan.scenes[i]`: `{ id: uid(), sceneId: scene.id, title: scene.title, speakers: scene.speakers, prompt: scene.visual + '\n' + scene.dialogue, status: 'pending' }` (mirrors the store's story-mode construction).
  - `bioPlanToClips(bioPlan: BiographyPlan): Clip[]` — one `Clip` per shot across `pages`, `title` = `"Page N · Shot M"`, empty `speakers`, `prompt = shot.visual`, `status: 'pending'` (mirrors the store's biography construction).
- `POST /api/plan` — body `{ brief: Brief; model?: string }`; `configureFal(readEnv().FAL_KEY)`; branch on `brief.type`: story → `makePlan(brief, model ?? DEFAULT_MODEL)` → `planToClips`; biography → `makeBioPlan(...)` → `bioPlanToClips`. Insert a `sessions` row (`createSession`) with the brief/plan/bioPlan/category/videoModel (videoModel from body or `DEFAULT_VIDEO_MODEL`), then `insertClips(db, sessionId, clips)`. Return `{ sessionId, plan|bioPlan, category, clips: <inserted rows mapped to domain via rowToClip with no media yet> }`. On any fal/LLM error, return `{ error: mapFalError(e) }` with status 502.

- [ ] **Step 1: Write the failing test for the pure builders**

```ts
// src/server/pipeline/clips.test.ts
import { describe, it, expect } from 'vitest'
import { planToClips, bioPlanToClips } from './clips'
import type { Plan, BiographyPlan } from '../../lib/types'

describe('planToClips', () => {
  it('makes one pending clip per scene with visual+dialogue prompt', () => {
    const plan: Plan = { category: 'Drama', characters: [], scenes: [
      { id: 's1', title: 'Open', speakers: ['A'], visual: 'a room', dialogue: 'Hello' },
    ] }
    const clips = planToClips(plan)
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ sceneId: 's1', title: 'Open', speakers: ['A'], prompt: 'a room\nHello', status: 'pending' })
    expect(clips[0].id).toBeTruthy()
  })
})

describe('bioPlanToClips', () => {
  it('makes one pending clip per shot titled Page N · Shot M with visual prompt', () => {
    const bio: BiographyPlan = { subject: 'Ada', style: 'watercolor', stages: [], pages: [
      { id: 'p1', index: 1, narration: 'n', shots: [{ id: 'sh1', visual: 'a desk' }, { id: 'sh2', visual: 'a lamp' }] },
    ] }
    const clips = bioPlanToClips(bio)
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({ sceneId: 'sh1', title: 'Page 1 · Shot 1', speakers: [], prompt: 'a desk', status: 'pending' })
    expect(clips[1]).toMatchObject({ sceneId: 'sh2', title: 'Page 1 · Shot 2', status: 'pending' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/pipeline/clips.test.ts`
Expected: FAIL — cannot find module `./clips`.

- [ ] **Step 3: Write the pure builders**

```ts
// src/server/pipeline/clips.ts
import type { Plan, BiographyPlan, Clip } from '../../lib/types'

let counter = 0
function uid(): string {
  counter += 1
  return `clip_${counter}_${counter * 2654435761 % 2 ** 31}`
}

export function planToClips(plan: Plan): Clip[] {
  return plan.scenes.map((scene) => ({
    id: uid(),
    sceneId: scene.id,
    title: scene.title,
    speakers: scene.speakers,
    prompt: `${scene.visual}\n${scene.dialogue}`,
    status: 'pending' as const,
  }))
}

export function bioPlanToClips(bioPlan: BiographyPlan): Clip[] {
  const clips: Clip[] = []
  for (const page of bioPlan.pages) {
    page.shots.forEach((shot, i) => {
      clips.push({
        id: uid(),
        sceneId: shot.id,
        title: `Page ${page.index} · Shot ${i + 1}`,
        speakers: [],
        prompt: shot.visual,
        status: 'pending',
      })
    })
  }
  return clips
}
```

> `uid()` here only labels the in-memory domain `Clip`; the DB assigns the authoritative row id on insert (Plan 2). `Date.now()`/`Math.random()` are avoided per repo constraints — a module counter is deterministic and sufficient for a transient label.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/pipeline/clips.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `app/api/plan/route.ts`**

```ts
// app/api/plan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { Brief, Session } from '../../../src/lib/types'
import { makePlan, makeBioPlan } from '../../../src/services/studio/plan'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL } from '../../../src/services/fal/client'
import { mapFalError } from '../../../src/services/fal/errors'
import { configureFal } from '../../../src/server/fal/queue'
import { readEnv } from '../env'
import { getSupabase } from '../../../src/server/db/client'
import { createSession } from '../../../src/server/db/sessions'
import { insertClips } from '../../../src/server/db/clips'
import { rowToClip } from '../../../src/server/db/mappers'
import { planToClips, bioPlanToClips } from '../../../src/server/pipeline/clips'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { brief?: Brief; model?: string; videoModel?: string }
  const brief = body.brief
  if (!brief?.idea) return NextResponse.json({ error: 'brief.idea required' }, { status: 400 })

  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const videoModel = body.videoModel ?? DEFAULT_VIDEO_MODEL

  try {
    let session: Session
    if (brief.type === 'biography') {
      const bioPlan = await makeBioPlan(brief, body.model ?? DEFAULT_MODEL)
      const clips = bioPlanToClips(bioPlan)
      session = { id: '', title: brief.idea.slice(0, 60), createdAt: 0, updatedAt: 0, brief, plan: null, bioPlan, category: 'Biography', clips, videoModel }
      const sessionId = await createSession(db, session)
      const rows = await insertClips(db, sessionId, clips)
      return NextResponse.json({ sessionId, bioPlan, category: 'Biography', clips: rows.map((r) => rowToClip(r, {})) })
    }
    const plan = await makePlan(brief, body.model ?? DEFAULT_MODEL)
    const clips = planToClips(plan)
    session = { id: '', title: brief.idea.slice(0, 60), createdAt: 0, updatedAt: 0, brief, plan, bioPlan: null, category: plan.category, clips, videoModel }
    const sessionId = await createSession(db, session)
    const rows = await insertClips(db, sessionId, clips)
    return NextResponse.json({ sessionId, plan, category: plan.category, clips: rows.map((r) => rowToClip(r, {})) })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
```

> Import paths are relative from `app/api/plan/` up to repo root then into `src/...`. Confirm the depth (`../../../src/...`) resolves under `pnpm next:build`/`typecheck`; adjust the number of `../` if the build reports an unresolved path. Do NOT switch to `@/` (root alias maps to repo root, so `@/src/...` would also work — pick one and keep it consistent with the other route handlers).

- [ ] **Step 6: Full verification + commit**

Run: `pnpm vitest run src/server/pipeline/clips.test.ts && pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/pipeline/clips.ts src/server/pipeline/clips.test.ts app/api/plan/route.ts
git commit -m "feat(api): /api/plan — plan/bioPlan + persist session & clips"
```

- [ ] **Step 7 *(live smoke)*: record steps (run when credentials exist)**

In the report, list the unchecked live-smoke: with real env, `curl -X POST /api/plan` (authenticated cookie) with a story brief → expect `{ sessionId, plan, clips: [...] }` and a `sessions` + N `clips` rows in Supabase; repeat with a biography brief.

---

### Task 4: Job input builders (pure)

**Files:**
- Create: `src/server/pipeline/inputs.ts`
- Test: `src/server/pipeline/inputs.test.ts`

**Interfaces:**
- Consumes: the exported prompt builders (Task 1), `buildVideoInput`/`getVideoModel`/`ENDPOINTS` (`fal/client.ts`), domain types.
- Produces (pure — each returns `{ endpointId, input }` for a fal job):
  - `characterMintJob(c: Character): { endpointId; input }` — nano-banana base t2i, `image_urls` absent, `aspect_ratio: '1:1'`, prompt from `buildCharacterImagePrompt`.
  - `stageMintJob(subject, stage, style): { endpointId; input }` — nano-banana, `1:1`, `buildStageImagePrompt`.
  - `sceneKeyframeJob(scene, presentImageUrls: string[], aspect): { endpointId; input }` — nano-banana **edit** endpoint when `presentImageUrls.length`, else base; `aspect_ratio` 16:9/9:16; `image_urls` when present; prompt from `buildKeyframePrompt`.
  - `bioKeyframeJob(visual, stageImageUrls, style, aspect): { endpointId; input }` — same pattern with `buildBioKeyframePrompt`.
  - `sceneVideoJob(videoModel, scene, keyframeUrl, voiceByName, durationSec, aspect): { endpointId; input }` — `endpointId = videoModel`, `input = buildVideoInput(getVideoModel(videoModel), { prompt: buildVideoPrompt(scene, voiceByName, model.audio), startImageUrl: keyframeUrl, durationSec, aspect })`.
  - `bioVideoJob(videoModel, style, visual, keyframeUrl, durationSec, aspect): { endpointId; input }` — like scene video but `buildBioVideoPrompt` + `forceSilent: true`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/pipeline/inputs.test.ts
import { describe, it, expect } from 'vitest'
import { characterMintJob, sceneKeyframeJob, sceneVideoJob, bioVideoJob } from './inputs'
import { ENDPOINTS } from '../../services/fal/client'
import type { Character, Scene } from '../../lib/types'

const character: Character = { name: 'Robot', appearance: 'tin', voice: 'metallic' }
const scene: Scene = { id: 's1', title: 'T', speakers: ['Robot'], visual: 'robot waves', dialogue: 'Hi' }

describe('characterMintJob', () => {
  it('targets nano-banana base t2i with a 1:1 aspect and no refs', () => {
    const { endpointId, input } = characterMintJob(character)
    expect(endpointId).toBe(ENDPOINTS.nanoBanana)
    expect(input.aspect_ratio).toBe('1:1')
    expect(input.image_urls).toBeUndefined()
    expect(typeof input.prompt).toBe('string')
  })
})

describe('sceneKeyframeJob', () => {
  it('uses the edit endpoint and passes image_urls when refs present', () => {
    const { endpointId, input } = sceneKeyframeJob(scene, ['https://s3/a.png'], 'landscape')
    expect(endpointId).toBe(ENDPOINTS.nanoBananaEdit)
    expect(input.image_urls).toEqual(['https://s3/a.png'])
    expect(input.aspect_ratio).toBe('16:9')
  })
  it('uses the base endpoint with no refs', () => {
    const { endpointId, input } = sceneKeyframeJob(scene, [], 'portrait')
    expect(endpointId).toBe(ENDPOINTS.nanoBanana)
    expect(input.image_urls).toBeUndefined()
    expect(input.aspect_ratio).toBe('9:16')
  })
})

describe('video jobs', () => {
  it('sceneVideoJob targets the model id and sets start image + duration', () => {
    const { endpointId, input } = sceneVideoJob('bytedance/seedance-2.0/image-to-video', scene, 'https://s3/k.png', new Map([['Robot', 'metallic']]), 8, 'landscape')
    expect(endpointId).toBe('bytedance/seedance-2.0/image-to-video')
    expect(input.image_url).toBe('https://s3/k.png')
    expect(String(input.duration)).toContain('8')
  })
  it('bioVideoJob forces silent audio', () => {
    const { input } = bioVideoJob('bytedance/seedance-2.0/image-to-video', 'watercolor', 'a lab', 'https://s3/k.png', 8, 'landscape')
    expect(input.generate_audio).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/pipeline/inputs.test.ts`
Expected: FAIL — cannot find module `./inputs`.

- [ ] **Step 3: Write `inputs.ts`**

```ts
// src/server/pipeline/inputs.ts
import type { Character, Scene, BioStage } from '../../lib/types'
import { ENDPOINTS, buildVideoInput, getVideoModel, type VideoModelId } from '../../services/fal/client'
import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from '../../services/studio/image'
import { buildVideoPrompt, buildBioVideoPrompt } from '../../services/studio/video'

export interface FalJob { endpointId: string; input: Record<string, unknown> }
type Aspect = 'landscape' | 'portrait'
const ar = (a: Aspect) => (a === 'portrait' ? '9:16' : '16:9')

export function characterMintJob(c: Character): FalJob {
  return { endpointId: ENDPOINTS.nanoBanana, input: { prompt: buildCharacterImagePrompt(c), aspect_ratio: '1:1' } }
}
export function stageMintJob(subject: string, stage: BioStage, style: string): FalJob {
  return { endpointId: ENDPOINTS.nanoBanana, input: { prompt: buildStageImagePrompt(subject, stage, style), aspect_ratio: '1:1' } }
}
export function sceneKeyframeJob(scene: Scene, presentImageUrls: string[], aspect: Aspect): FalJob {
  const hasRefs = presentImageUrls.length > 0
  return {
    endpointId: hasRefs ? ENDPOINTS.nanoBananaEdit : ENDPOINTS.nanoBanana,
    input: { prompt: buildKeyframePrompt(scene, aspect), aspect_ratio: ar(aspect), ...(hasRefs ? { image_urls: presentImageUrls } : {}) },
  }
}
export function bioKeyframeJob(visual: string, stageImageUrls: string[], style: string, aspect: Aspect): FalJob {
  const hasRefs = stageImageUrls.length > 0
  return {
    endpointId: hasRefs ? ENDPOINTS.nanoBananaEdit : ENDPOINTS.nanoBanana,
    input: { prompt: buildBioKeyframePrompt(visual, style, aspect), aspect_ratio: ar(aspect), ...(hasRefs ? { image_urls: stageImageUrls } : {}) },
  }
}
export function sceneVideoJob(videoModel: VideoModelId, scene: Scene, keyframeUrl: string, voiceByName: Map<string, string>, durationSec: number, aspect: Aspect): FalJob {
  const model = getVideoModel(videoModel)
  return { endpointId: model.id, input: buildVideoInput(model, { prompt: buildVideoPrompt(scene, voiceByName, model.audio), startImageUrl: keyframeUrl, durationSec, aspect }) }
}
export function bioVideoJob(videoModel: VideoModelId, style: string, visual: string, keyframeUrl: string, durationSec: number, aspect: Aspect): FalJob {
  const model = getVideoModel(videoModel)
  return { endpointId: model.id, input: buildVideoInput(model, { prompt: buildBioVideoPrompt(style, visual), startImageUrl: keyframeUrl, durationSec, aspect, forceSilent: true }) }
}
```

> Confirm `buildKeyframePrompt`'s real signature — the current `sceneKeyframe` calls it as `buildKeyframePrompt(scene, aspect)`. If it takes only `scene`, drop the `aspect` arg here. Task 1's export step is where you learned the true signature; use it.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/server/pipeline/inputs.test.ts`
Expected: PASS (5 assertions across 4 tests).

- [ ] **Step 5: Full verification + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/pipeline/inputs.ts src/server/pipeline/inputs.test.ts
git commit -m "feat(pipeline): pure fal job input builders"
```

---

### Task 5: Character generation — submit + status

**Files:**
- Create: `app/api/generate/character/route.ts`, `app/api/status/character/[id]/route.ts`
- Test: none new unit (logic is the already-tested `characterMintJob` + repo + S3 wrapper); verified by *(live smoke)*

**Interfaces:**
- `POST /api/generate/character` — body `{ character: Character }`. `configureFal`; `submit(characterMintJob(c))` → `requestId`; `upsertCharacter(db, c, imageKey='')` then set `request_id`+`status='queued'` (or extend `upsertCharacter` usage: insert with a pending status and the request_id). Return `{ characterId, requestId }`.
- `GET /api/status/character/[id]` — load the character row; `jobStatus(ENDPOINTS.nanoBanana, request_id)`; if not done → `{ status: 'queued'|'running' }`; if done → `jobResult` → `{ images:[{url}] }` → `downloadToBytes(url)` → `putObject('characters/{id}.png', bytes, contentType)` → update row `image_key`+`status='done'` → `{ status: 'done', url: presignGet('characters/{id}.png') }`. On `jobResult` throw → `mapFalError` → set row `status='error'` → `{ status: 'error', error }`.

> This task adds a small amount to the characters repo if needed: a way to set `request_id`/`status` on insert and to update `image_key`/`status` by id. If `upsertCharacter` (Plan 2) can't express the pending insert, add `insertPendingCharacter(db, c, requestId)` and `finishCharacter(db, id, imageKey)` to `src/server/db/characters.ts` with focused tests mirroring Plan 2's fake-builder pattern. Keep those tests real-behavior (assert table/columns + returned row), no assert-nothing tests.

- [ ] **Step 1: If needed, extend the characters repo (TDD)**

Read `src/server/db/characters.ts`. If a pending-insert + finish-update aren't expressible with the existing `upsertCharacter`, add:
```ts
export async function insertPendingCharacter(db: SupabaseClient, c: CharacterImage, requestId: string): Promise<CharacterRow> {
  const { data, error } = await db.from('character_library')
    .insert({ ...characterToInsert(c, ''), request_id: requestId, status: 'queued' })
    .select('*').single()
  if (error) throw error
  return data as CharacterRow
}
export async function finishCharacter(db: SupabaseClient, id: string, imageKey: string): Promise<void> {
  const { error } = await db.from('character_library').update({ image_key: imageKey, status: 'done', request_id: null }).eq('id', id)
  if (error) throw error
}
export async function getCharacter(db: SupabaseClient, id: string): Promise<CharacterRow | null> {
  const { data, error } = await db.from('character_library').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  return (data as CharacterRow) ?? null
}
```
Add a focused test for `insertPendingCharacter` (asserts it inserts into `character_library` with `status:'queued'` + `request_id`, returns the row) and `getCharacter` (returns mapped row / null), mirroring `characters.test.ts`'s fake-builder pattern. `finishCharacter` is a void mutator — not unit-tested.

- [ ] **Step 2: Write the two route handlers**

```ts
// app/api/generate/character/route.ts
import { NextRequest, NextResponse } from 'next/server'
import type { Character, CharacterImage } from '../../../../src/lib/types'
import { readEnv } from '../../env'
import { configureFal, submit } from '../../../../src/server/fal/queue'
import { mapFalError } from '../../../../src/services/fal/errors'
import { getSupabase } from '../../../../src/server/db/client'
import { insertPendingCharacter } from '../../../../src/server/db/characters'
import { characterMintJob } from '../../../../src/server/pipeline/inputs'

export async function POST(req: NextRequest) {
  const { character } = (await req.json().catch(() => ({}))) as { character?: Character }
  if (!character?.name) return NextResponse.json({ error: 'character required' }, { status: 400 })
  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  try {
    const job = characterMintJob(character)
    const requestId = await submit(job.endpointId, job.input)
    const draft: CharacterImage = { id: '', name: character.name, url: '', source: 'minted', createdAt: 0 }
    const row = await insertPendingCharacter(db, draft, requestId)
    return NextResponse.json({ characterId: row.id, requestId })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
```

```ts
// app/api/status/character/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '../../../env'
import { configureFal, jobStatus, jobResult, downloadToBytes } from '../../../../../src/server/fal/queue'
import { ENDPOINTS } from '../../../../../src/services/fal/client'
import { mapFalError } from '../../../../../src/services/fal/errors'
import { getSupabase } from '../../../../../src/server/db/client'
import { getCharacter, finishCharacter } from '../../../../../src/server/db/characters'
import { makeS3 } from '../../../../../src/server/storage/s3'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const s3 = makeS3(env)
  const row = await getCharacter(db, id)
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (row.status === 'done') return NextResponse.json({ status: 'done', url: await s3.presignGet(row.image_key) })
  if (!row.request_id) return NextResponse.json({ status: row.status })
  try {
    const st = await jobStatus(ENDPOINTS.nanoBanana, row.request_id)
    if (st.phase !== 'done') return NextResponse.json({ status: st.phase })
    const data = await jobResult<{ images: { url: string }[] }>(ENDPOINTS.nanoBanana, row.request_id)
    const url = data.images[0].url
    const { bytes, contentType } = await downloadToBytes(url)
    const key = `characters/${id}.png`
    await s3.putObject(key, bytes, contentType)
    await finishCharacter(db, id, key)
    return NextResponse.json({ status: 'done', url: await s3.presignGet(key) })
  } catch (e) {
    return NextResponse.json({ status: 'error', error: mapFalError(e) }, { status: 502 })
  }
}
```

- [ ] **Step 3: Run the repo test (if added) + full verification**

Run: `pnpm vitest run src/server/db/characters.test.ts && pnpm typecheck && pnpm build && pnpm next:build`
Expected: repo tests pass; all builds 0. (Next 15 route `params` is a Promise — the `await params` above is required; confirm no type error.)

- [ ] **Step 4: Commit**

```bash
git add app/api/generate/character/route.ts "app/api/status/character/[id]/route.ts" src/server/db/characters.ts src/server/db/characters.test.ts
git commit -m "feat(api): character mint submit + status (S3 upload on completion)"
```

- [ ] **Step 5 *(live smoke)*: record steps** — with real env: POST a character → get `{characterId, requestId}`; poll the status route until `{status:'done', url}`; confirm the object exists in S3 and the row has `image_key`+`status='done'`.

---

### Task 6: Scene/shot generation — submit + the keyframe→video state machine

**Files:**
- Create: `app/api/generate/scene/route.ts`, `app/api/status/clip/[id]/route.ts`
- Modify: `src/server/db/clips.ts` (add `getClip(db, id)` + reuse `updateClipStatus`), `src/server/db/sessions.ts` (add `getSessionRow(db, id)` returning the raw row for brief/videoModel/plan access) — each with a focused real-behavior test.
- Test: `src/server/pipeline/advance.test.ts` (the pure next-step decision), plus the repo getters' tests
- *(live smoke)* for the full chain.

**Interfaces:**
- `POST /api/generate/scene` — body `{ sessionId, sceneId }`. Load the session row (for `brief.aspect`, `video_model`, and the plan/bioPlan to find the scene + present speakers). Resolve present character image URLs: for story, look up each `scene.speakers` name in `character_library` (case-insensitive) → `presignGet(image_key)`. Submit the keyframe job (`sceneKeyframeJob` or `bioKeyframeJob`), set the clip's `request_id`+`status='running'`+`phase='queued'`+`image_key=null`. Return `{ requestId }`.
- `GET /api/status/clip/[id]` — the state machine:
  1. `getClip`; if `video_key` set → `{ status:'done', videoUrl: presignGet(video_key) }`.
  2. If no `request_id` → `{ status: clip.status }`.
  3. `jobStatus(endpointId, request_id)` where `endpointId` = the keyframe endpoint if `image_key` is null else the video model id. If phase ≠ done → `{ status:'running', phase }`.
  4. If done and `image_key` null (keyframe finished): `jobResult` → keyframe url → download → `putObject('sessions/{sid}/clips/{cid}.png')` → set `image_key`. Then build the video job (`sceneVideoJob`/`bioVideoJob`, `startImageUrl = presignGet(image_key)`), `submit`, set `request_id`=video job, `phase='queued'`. Return `{ status:'running', phase:'queued' }`.
  5. If done and `image_key` set (video finished): `jobResult` → video url → download → `putObject('sessions/{sid}/clips/{cid}.mp4')` → set `video_key`+`status='done'`+`duration_sec`. Return `{ status:'done', videoUrl: presignGet(video_key) }`.
  On any `jobResult` throw → `mapFalError` → `updateClipStatus(status='error', error, request_id=null)` → `{ status:'error', error }`.
- Pure `advance.ts` decision helper (unit-tested): `nextClipAction(row: ClipRow): 'submit-keyframe-pending' | 'poll-keyframe' | 'poll-video' | 'done'` — given the row's key/request fields, returns which branch applies. This isolates the state-machine logic from the I/O so it can be tested exhaustively.

- [ ] **Step 1: Write the failing test for the pure state-machine decision**

```ts
// src/server/pipeline/advance.test.ts
import { describe, it, expect } from 'vitest'
import { nextClipAction } from './advance'
import type { ClipRow } from '../db/rows'

const base: ClipRow = {
  id: 'c', session_id: 's', scene_id: 'sc', title: 'T', speakers: [], prompt: 'p',
  status: 'pending', phase: null, request_id: null, image_key: null, video_key: null,
  duration_sec: null, error: null, created_at: 'x',
}

describe('nextClipAction', () => {
  it('done when video_key set', () => {
    expect(nextClipAction({ ...base, video_key: 'v.mp4', image_key: 'k.png' })).toBe('done')
  })
  it('poll-keyframe when request set, no image_key', () => {
    expect(nextClipAction({ ...base, request_id: 'r', status: 'running' })).toBe('poll-keyframe')
  })
  it('poll-video when image_key set, request set, no video_key', () => {
    expect(nextClipAction({ ...base, image_key: 'k.png', request_id: 'r2', status: 'running' })).toBe('poll-video')
  })
  it('submit-keyframe-pending when nothing started', () => {
    expect(nextClipAction(base)).toBe('submit-keyframe-pending')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/pipeline/advance.test.ts`
Expected: FAIL — cannot find module `./advance`.

- [ ] **Step 3: Write `advance.ts`**

```ts
// src/server/pipeline/advance.ts
import type { ClipRow } from '../db/rows'

export type ClipAction = 'submit-keyframe-pending' | 'poll-keyframe' | 'poll-video' | 'done'

export function nextClipAction(row: ClipRow): ClipAction {
  if (row.video_key) return 'done'
  if (row.image_key && row.request_id) return 'poll-video'
  if (row.request_id) return 'poll-keyframe'
  return 'submit-keyframe-pending'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/server/pipeline/advance.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add repo getters (TDD, real-behavior)**

In `src/server/db/clips.ts` add `getClip(db, id): Promise<ClipRow | null>` (select by id, PGRST116→null). In `src/server/db/sessions.ts` add `getSessionRow(db, id): Promise<SessionRow | null>` (raw row, for brief/plan/video_model). Add focused tests mirroring the Plan-2 fake-builder pattern (assert table/filter + returned mapped/raw row + null case). Do not add assert-nothing tests.

- [ ] **Step 6: Write the two route handlers** (the generate submit + the status state machine)

Implement `app/api/generate/scene/route.ts` and `app/api/status/clip/[id]/route.ts` per the Interfaces above, using: `getSessionRow` (to read `brief.aspect`, `video_model`, and locate the scene/shot + speakers in `plan`/`bio_plan`), `listCharacters`+`presignGet` (present speaker images), `sceneKeyframeJob`/`bioKeyframeJob`/`sceneVideoJob`/`bioVideoJob` (Task 4), `submit`/`jobStatus`/`jobResult`/`downloadToBytes` (Task 2), `makeS3` (Plan 2), `getClip`/`updateClipStatus` (clips repo), `nextClipAction` (this task), `mapFalError`. Branch story vs biography on `brief.type` (biography clips have empty speakers and use the bio job builders + the stage portrait for the shot's `stageId`). Story scenes are a fixed 8s (`durationSec: 8`); biography uses `brief.shotSec`. Follow the exact keyframe→video chaining in the Interfaces. Keep the handler readable; push any non-trivial pure decision into `advance.ts` or `inputs.ts` rather than inlining.

- [ ] **Step 7: Full verification**

Run: `pnpm vitest run src/server/pipeline/advance.test.ts src/server/db/clips.test.ts src/server/db/sessions.test.ts && pnpm typecheck && pnpm build && pnpm next:build`
Expected: unit tests pass; all builds 0.

- [ ] **Step 8: Commit**

```bash
git add app/api/generate/scene/route.ts "app/api/status/clip/[id]/route.ts" src/server/db/clips.ts src/server/db/clips.test.ts src/server/db/sessions.ts src/server/db/sessions.test.ts src/server/pipeline/advance.ts src/server/pipeline/advance.test.ts
git commit -m "feat(api): scene/shot keyframe->video state machine (submit + status)"
```

- [ ] **Step 9 *(live smoke — the critical end-to-end)*: record steps**
With real env + a session from `/api/plan`: POST each character → poll to done; POST each scene → poll `/api/status/clip/:id` and observe it transition queued→running (keyframe) → running/queued (video) → done with a playable `videoUrl`; confirm `sessions/{sid}/clips/{cid}.png` and `.mp4` exist in S3 and the `clips` row has both keys + `status='done'`. Repeat for a biography session (silent shots, stage portraits). This is where the Plan-2 live-only risks (numeric duration, `onConflict`) and the fal queue behavior are first exercised for real.

---

## Self-Review

**Spec coverage (Plan 3 slice):**
- fal `subscribe`→`queue` refactor (submit/status/result) → Task 2. ✅
- `/api/plan` (story + biography) persisting session+clips → Task 3. ✅
- Async, non-blocking generation (no request holds a 10-min video) → the per-clip state machine, Tasks 5-6. ✅
- Media downloaded from fal → uploaded to S3 → keys in DB → presigned URLs to client → Tasks 5-6. ✅
- Reuse of existing planning/prompt/input construction → Tasks 1, 4. ✅
- Errors via `mapFalError` → clip/character `status='error'` → Tasks 3, 5, 6. ✅
- `configureFal` per request → every route handler. ✅
- Deferred to Plan 4: rewiring the zustand store to call these endpoints, `/api/sessions` + `/api/characters` CRUD, and the boot hydration. Deferred to Plan 5: the UI cutover.

**Placeholder scan:** no TBD/TODO. Task 6 Step 6 describes the two handlers by precise interface + the exact chaining rather than pasting ~120 lines of glue verbatim — deliberate: the handler is assembled from already-specified, already-tested pure pieces (`nextClipAction`, the job builders, the repo getters, the queue/S3 wrappers), so the risk lives in those units (which have code + tests here), not in the thin orchestration. The *(live smoke)* steps are explicit, not placeholders.

**Type/name consistency:** `submit`/`jobStatus`/`jobResult`/`downloadToBytes`, `readEnv`, `planToClips`/`bioPlanToClips`, `characterMintJob`/`sceneKeyframeJob`/`sceneVideoJob`/`bioKeyframeJob`/`bioVideoJob`/`stageMintJob`, `nextClipAction`, `insertPendingCharacter`/`finishCharacter`/`getCharacter`, `getClip`/`getSessionRow` are used consistently across tasks. Endpoint ids come from `ENDPOINTS`/model ids. The state-machine key/field semantics match the Plan-2 `ClipRow` columns exactly.

**Signature-risk note for the executor:** Task 1 is deliberately first because the exact params of `buildKeyframePrompt`/`buildVideoPrompt`/etc. must be confirmed from the real source before Task 4 consumes them. If a real signature differs from this plan's sample calls, adjust the call sites in `inputs.ts` (and its test) to match the source — the source is authoritative.

## Execution Handoff

This is Plan 3 of 5. It is the credential inflection point: the unit-tested pure pieces and wrappers land without credentials, but the *(live smoke)* steps — and the first real exercise of the Plan-2 latent risks and the fal queue — require a Supabase project + AWS S3 bucket + fal key. Plan 4 (Sessions & Characters API + store rewire) and Plan 5 (frontend cutover) follow.
