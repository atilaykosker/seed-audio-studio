# Lip-sync Combine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In video mode, fuse each scene's silent kling video + its seed-audio into a single lip-synced MP4 via `fal-ai/latentsync`, replacing the separate video+audio playback with one combined clip (graceful fallback to separate playback on failure).

**Architecture:** Add a `latentSync` fal wrapper and a `lipSyncScene` studio step. After a scene's audio and kling video both succeed in video mode, `generateFromPlan` runs LatentSync and stores a `lipsyncUrl` on the clip; `ClipCard` plays that single combined video when present, else falls back to today's muted-video + synced-audio. No planner/audio changes.

**Tech Stack:** Vite + React 19 + TypeScript + Zustand + `@fal-ai/client` + Vitest (jsdom, globals).

## Global Constraints

- BYOK, client-side only, no backend; no new runtime dependencies. Path alias `@/` → `src/`.
- Model endpoint: `fal-ai/latentsync`; input fields `video_url` + `audio_url`; output `data.video.url`.
- LatentSync runs ONLY when `Brief.withVideo` is true AND both the scene's audio and kling video succeeded.
- Lip-sync failure is independent: scoped error `lipsync:<sceneId>`, clip keeps `videoUrl` + `url` for the existing separate playback; audio/video results are not cleared.
- No audio splitting; scenes/planner/guide are unchanged. Audio stays multi-speaker.
- Cost estimate adds ~$0.20 per scene (LatentSync) when `withVideo`.
- Tests import from `vitest` explicitly. Style: 2-space indent, no semicolons, single quotes. Match existing patterns (mock `@fal-ai/client` via `vi.fn`; mock studio deps via `vi.hoisted`).

---

### Task 1: Types + cost

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/cost.ts`
- Modify: `src/lib/cost.test.ts`

**Interfaces:**
- Produces: `Clip.lipsyncUrl?: string`, `Clip.lipsyncStatus?: ClipStatus`, `Clip.lipsyncPhase?: 'queued' | 'running' | 'done'`; `estimatePlanCost` adds a per-scene LatentSync term when `withVideo`.

- [ ] **Step 1: Update the cost test (failing)**

In `src/lib/cost.test.ts`, replace the `withVideo` assertion body so it expects the lip-sync term:

```ts
  it('adds nano-banana (per char + per scene), kling seconds, and lip-sync when withVideo', () => {
    const audio = (130 / 60) * 0.1875
    const images = (2 + 2) * 0.039 // 2 char images + 2 scene keyframes
    const video = 2 * 10 * 0.112 // 2 scenes * 10s * $/s
    const lipsync = 2 * 0.2 // 2 scenes * $0.20 LatentSync
    expect(estimatePlanCost(plan, 40, true)).toBeCloseTo(audio + images + video + lipsync, 5)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: FAIL — the with-video figure is short by `2 * 0.2`.

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, add to the `Clip` interface (after the existing `videoPhase?` field):

```ts
  lipsyncUrl?: string
  lipsyncStatus?: ClipStatus
  lipsyncPhase?: 'queued' | 'running' | 'done'
```

- [ ] **Step 4: Add the cost term**

In `src/lib/cost.ts`, add a constant near the other price constants:

```ts
/** LatentSync lip-sync price: ~$0.20 flat per clip (<=40s). */
const LIPSYNC_EACH = 0.2
```

Then in `estimatePlanCost`, change the video-mode return to include lip-sync:

```ts
  const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
  const video = plan.scenes.length * VIDEO_SEC * VIDEO_PER_SEC
  const lipsync = plan.scenes.length * LIPSYNC_EACH
  return audio + images + video + lipsync
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cost.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/cost.ts src/lib/cost.test.ts
git commit -m "feat(types): lipsync clip fields + per-scene LatentSync cost"
```

---

### Task 2: fal client `latentSync` wrapper

**Files:**
- Modify: `src/services/fal/client.ts`
- Modify: `src/services/fal/client.test.ts`

**Interfaces:**
- Consumes: `run`, `RunOptions`, `TIMEOUTS`, `ENDPOINTS`.
- Produces: `ENDPOINTS.latentSync = 'fal-ai/latentsync'`; `latentSync(args: { videoUrl: string; audioUrl: string }, opts?: RunOptions): Promise<{ url: string }>`.

- [ ] **Step 1: Write the failing test**

Add to `src/services/fal/client.test.ts` (a new describe block at the end):

```ts
describe('latentSync', () => {
  it('sends video_url + audio_url and returns the combined video url', async () => {
    subscribe.mockResolvedValue({ data: { video: { url: 'https://combined/1' } }, requestId: 'r' })
    const r = await latentSync({ videoUrl: 'https://vid', audioUrl: 'https://aud' })
    expect(r.url).toBe('https://combined/1')
    const [endpoint, cfg] = subscribe.mock.calls[0]
    expect(endpoint).toBe(ENDPOINTS.latentSync)
    expect(cfg.input).toEqual({ video_url: 'https://vid', audio_url: 'https://aud' })
  })
})
```

Add `latentSync` to the import at the top of the test file:

```ts
import {
  nanoBanana,
  klingVideo,
  seedAudio,
  latentSync,
  clampPrompt,
  stripInvalidElementRefs,
  run,
  TimeoutError,
  ENDPOINTS,
  SEED_AUDIO_MAX_PROMPT,
} from './client'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: FAIL — `latentSync` is not exported.

- [ ] **Step 3: Implement the wrapper**

In `src/services/fal/client.ts`, add `latentSync` to `ENDPOINTS`:

```ts
  /** Lip-sync / dubbing: fuse a video + audio into one lip-synced clip. */
  latentSync: 'fal-ai/latentsync',
```

Append at the end of the file:

```ts
interface LatentSyncOutput {
  video: { url: string; content_type?: string; file_name?: string; file_size?: number }
}

/** Lip-sync a video to an audio track, returning a single combined clip (audio embedded). */
export async function latentSync(
  args: { videoUrl: string; audioUrl: string },
  opts: RunOptions = {},
): Promise<{ url: string }> {
  const { data } = await run<LatentSyncOutput>(
    ENDPOINTS.latentSync,
    { video_url: args.videoUrl, audio_url: args.audioUrl },
    { timeoutMs: TIMEOUTS.video, ...opts },
  )
  return { url: data.video.url }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/services/fal/client.test.ts`
Expected: PASS (all existing + the new latentSync test).

- [ ] **Step 5: Commit**

```bash
git add src/services/fal/client.ts src/services/fal/client.test.ts
git commit -m "feat(fal): add latentSync (lip-sync) wrapper"
```

---

### Task 3: `lipSyncScene` studio step

**Files:**
- Modify: `src/services/studio/video.ts`
- Modify: `src/services/studio/video.test.ts`

**Interfaces:**
- Consumes: `latentSync`, `QueuePhase` from `@/services/fal/client`.
- Produces: `lipSyncScene(videoUrl: string, audioUrl: string, onPhase?: (p: QueuePhase) => void): Promise<{ url: string }>`.

- [ ] **Step 1: Write the failing test**

In `src/services/studio/video.test.ts`, extend the hoisted mock and add a test.

Change the hoisted mock block to also mock `latentSync`:

```ts
const { klingVideo, latentSync } = vi.hoisted(() => {
  return { klingVideo: vi.fn(), latentSync: vi.fn() }
})

vi.mock('@/services/fal/client', () => ({ klingVideo, latentSync }))

import { generateSceneVideo, buildElementPrompt, lipSyncScene } from './video'
```

Add to `beforeEach`:

```ts
beforeEach(() => {
  klingVideo.mockReset()
  latentSync.mockReset()
})
```

Add a new describe block:

```ts
describe('lipSyncScene', () => {
  it('passes the video + audio urls through to latentSync and wires onPhase', async () => {
    latentSync.mockResolvedValue({ url: 'https://combined' })
    const onPhase = vi.fn()
    const r = await lipSyncScene('https://vid', 'https://aud', onPhase)
    expect(r.url).toBe('https://combined')
    const [args, opts] = latentSync.mock.calls[0]
    expect(args).toEqual({ videoUrl: 'https://vid', audioUrl: 'https://aud' })
    expect(typeof opts.onProgress).toBe('function')
  })
})
```

(If the existing `beforeEach` was `beforeEach(() => klingVideo.mockReset())`, replace it with the block above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/studio/video.test.ts`
Expected: FAIL — `lipSyncScene` is not exported.

- [ ] **Step 3: Implement the step**

In `src/services/studio/video.ts`, update the import to include `latentSync`:

```ts
import { klingVideo, latentSync, type KlingElement, type QueuePhase } from '@/services/fal/client'
```

Append the function at the end of the file:

```ts
/** Fuse a scene's silent video + its audio into one lip-synced clip (audio embedded). */
export async function lipSyncScene(
  videoUrl: string,
  audioUrl: string,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  return latentSync({ videoUrl, audioUrl }, onPhase ? { onProgress: onPhase } : {})
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/services/studio/video.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/services/studio/video.ts src/services/studio/video.test.ts
git commit -m "feat(studio): lipSyncScene step wrapping latentSync"
```

---

### Task 4: Orchestrate lip-sync in `generateFromPlan`

**Files:**
- Modify: `src/services/studio/generate.ts`
- Modify: `src/services/studio/generate.test.ts`

**Interfaces:**
- Consumes: `lipSyncScene` (Task 3), existing scene-loop.
- Produces: `GenerateCallbacks` gains `onLipSyncStart?(sceneId)`, `onLipSyncPhase?(sceneId, phase)`, `onLipSync?(sceneId, url)`. LatentSync runs per scene when `withVideo` and both audio+video urls exist.

- [ ] **Step 1: Write the failing test**

Add to `src/services/studio/generate.test.ts`. First extend the video mock (top of file) to include `lipSyncScene`:

```ts
const { generateSceneVideo, lipSyncScene } = vi.hoisted(() => ({ generateSceneVideo: vi.fn(), lipSyncScene: vi.fn() }))
vi.mock('./video', () => ({ generateSceneVideo, lipSyncScene }))
```

Add `lipSyncScene.mockReset()` to the `beforeEach` reset list.

Add these tests inside the existing `describe('generateFromPlan (video mode)', ...)`:

```ts
  it('lip-syncs the scene video with its audio when both succeed', async () => {
    mintCharacterImage.mockResolvedValue({ id: 'i1', name: 'A', url: 'https://charA', source: 'minted', createdAt: 0 })
    sceneKeyframe.mockResolvedValue('https://key')
    generateSceneVideo.mockResolvedValue({ url: 'https://vid' })
    lipSyncScene.mockResolvedValue({ url: 'https://combined' })
    const onLipSync = vi.fn()
    await generateFromPlan(plan, { library: [], characterLibrary: [], withVideo: true }, { onLipSync })
    // audio url 'https://audio' (seedAudio mock) + video url 'https://vid'
    expect(lipSyncScene).toHaveBeenCalledWith('https://vid', 'https://audio', expect.any(Function))
    expect(onLipSync).toHaveBeenCalledWith('sc1', 'https://combined')
  })

  it('does not lip-sync when the video step failed', async () => {
    mintCharacterImage.mockResolvedValue({ id: 'i1', name: 'A', url: 'https://charA', source: 'minted', createdAt: 0 })
    sceneKeyframe.mockRejectedValue(new Error('boom')) // video path throws before producing a url
    await generateFromPlan(plan, { library: [], characterLibrary: [], withVideo: true }, {})
    expect(lipSyncScene).not.toHaveBeenCalled()
  })

  it('a lip-sync failure is scoped and keeps the audio/video results', async () => {
    mintCharacterImage.mockResolvedValue({ id: 'i1', name: 'A', url: 'https://charA', source: 'minted', createdAt: 0 })
    sceneKeyframe.mockResolvedValue('https://key')
    generateSceneVideo.mockResolvedValue({ url: 'https://vid' })
    lipSyncScene.mockRejectedValue(new Error('no face'))
    const onScene = vi.fn()
    const onSceneVideo = vi.fn()
    const onError = vi.fn()
    await generateFromPlan(plan, { library: [], characterLibrary: [], withVideo: true }, { onScene, onSceneVideo, onError })
    expect(onScene).toHaveBeenCalledWith('sc1', { url: 'https://audio', durationSec: 9 })
    expect(onSceneVideo).toHaveBeenCalledWith('sc1', 'https://vid')
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('lipsync:sc1'), expect.any(String))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/studio/generate.test.ts`
Expected: FAIL — `lipSyncScene` never called; callbacks missing.

- [ ] **Step 3: Extend `GenerateCallbacks`**

In `src/services/studio/generate.ts`, add to the interface (after `onSceneVideo`):

```ts
  onLipSyncStart?: (sceneId: string) => void
  onLipSyncPhase?: (sceneId: string, phase: QueuePhase) => void
  onLipSync?: (sceneId: string, url: string) => void
```

Update the video import to include `lipSyncScene`:

```ts
import { generateSceneVideo, lipSyncScene } from './video'
```

- [ ] **Step 4: Capture the audio url + add the lip-sync step**

Replace the scene loop body (currently lines ~121-150) with:

```ts
  for (const scene of plan.scenes) {
    cb.onSceneStart?.(scene.id)
    let durationSec = 10
    let audioUrl: string | undefined
    try {
      const r = await generateScene(scene, resolved, cb)
      durationSec = r.durationSec || 10
      audioUrl = r.url
      cb.onScene?.(scene.id, r)
    } catch (e) {
      cb.onError?.(`scene:${scene.id}`, e instanceof Error ? e.message : String(e))
    }

    if (!withVideo) continue

    let videoUrl: string | undefined
    cb.onSceneVideoStart?.(scene.id)
    try {
      // Aligned to scene.speakers (undefined where a speaker has no image, e.g. a narrator).
      // generateSceneVideo drops the imageless speakers and renumbers @ElementN accordingly.
      const mappedImages = scene.speakers.map((n) => imageByName.get(n.toLowerCase()))
      const presentImages = mappedImages.filter((u): u is string => !!u)
      const keyframe = await sceneKeyframe(scene, presentImages)
      cb.onKeyframe?.(scene.id, keyframe)
      const v = await generateSceneVideo(scene, keyframe, mappedImages, durationSec, (p) =>
        cb.onSceneVideoPhase?.(scene.id, p),
      )
      videoUrl = v.url
      cb.onSceneVideo?.(scene.id, v.url)
    } catch (e) {
      cb.onError?.(`video:${scene.id}`, e instanceof Error ? e.message : String(e))
    }

    // Fuse the video + audio into one lip-synced clip when both are available.
    if (videoUrl && audioUrl) {
      cb.onLipSyncStart?.(scene.id)
      try {
        const ls = await lipSyncScene(videoUrl, audioUrl, (p) => cb.onLipSyncPhase?.(scene.id, p))
        cb.onLipSync?.(scene.id, ls.url)
      } catch (e) {
        cb.onError?.(`lipsync:${scene.id}`, e instanceof Error ? e.message : String(e))
      }
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/services/studio/generate.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Run the full suite**

Run: `pnpm test:run`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/studio/generate.ts src/services/studio/generate.test.ts
git commit -m "feat(studio): lip-sync fuse per scene in generateFromPlan"
```

---

### Task 5: Store wiring + regen

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: new `GenerateCallbacks` (Task 4), `lipSyncScene` (Task 3), Clip lipsync fields (Task 1).
- Produces: `runStudio` wires the 3 lip-sync callbacks onto clip state; `onError` handles the `lipsync:` scope; `regenScene` re-runs lip-sync after a successful video regen.

- [ ] **Step 1: Wire the new callbacks in `runStudio`**

In `src/store/useStore.ts`, in the `generateFromPlan(...)` callbacks object (after `onSceneVideo`), add:

```ts
        onLipSyncStart: (sceneId) => {
          set({ currentStep: 'Lip-syncing…' })
          patchClipByScene(sceneId, { lipsyncStatus: 'running' })
        },
        onLipSyncPhase: (sceneId, phase) => patchClipByScene(sceneId, { lipsyncPhase: phase }),
        onLipSync: (sceneId, url) => patchClipByScene(sceneId, { lipsyncStatus: 'done', lipsyncUrl: url }),
```

- [ ] **Step 2: Handle the `lipsync:` error scope**

In the same `onError` handler in `runStudio`, add a branch before the generic `else` (matching the existing `video:` branch style):

```ts
          } else if (scope.startsWith('lipsync:')) {
            patchClipByScene(scope.slice('lipsync:'.length), { lipsyncStatus: 'error' })
            get().toast({ kind: 'info', title: 'Lip-sync skipped', message: 'Playing video + audio separately for this clip.' })
```

- [ ] **Step 3: Re-run lip-sync in `regenScene`**

In `regenScene`, import `lipSyncScene` at the top of the file (alongside `generateSceneVideo`):

```ts
import { generateSceneVideo, lipSyncScene } from '@/services/studio/video'
```

After the successful video regen (`patch({ videoStatus: 'done', videoUrl: v.url })`), add a lip-sync pass. Locate this block in `regenScene`:

```ts
          const v = await generateSceneVideo(scene, keyframe, mappedImages, r.durationSec || 10, (phase) =>
            patch({ videoPhase: phase }),
          )
          patch({ videoStatus: 'done', videoUrl: v.url })
```

and append immediately after it (inside the same `try`):

```ts
          patch({ lipsyncStatus: 'running', lipsyncUrl: undefined })
          try {
            const ls = await lipSyncScene(v.url, r.url, (phase) => patch({ lipsyncPhase: phase }))
            patch({ lipsyncStatus: 'done', lipsyncUrl: ls.url })
          } catch {
            patch({ lipsyncStatus: 'error' })
          }
```

(Here `r` is the audio result from the scene regen — confirm `r.url` is the audio url in `regenScene`; it is the `generateScene` return `{ url, durationSec }`.)

- [ ] **Step 4: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test:run`
Expected: typecheck 0 errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(store): wire lip-sync callbacks + regen"
```

---

### Task 6: ClipCard — play the combined clip

**Files:**
- Modify: `src/components/ClipCard.tsx`

**Interfaces:**
- Consumes: `clip.lipsyncUrl`, `clip.lipsyncStatus`, `clip.lipsyncPhase` (Task 1), existing `clip.videoUrl`/`clip.url`.
- Produces: UI only.

- [ ] **Step 1: Render the combined video when present**

In `src/components/ClipCard.tsx`, read the current render. When `clip.lipsyncUrl` exists, show a single combined player instead of the muted-video + separate-audio pair:

```tsx
{clip.lipsyncUrl ? (
  <video src={clip.lipsyncUrl} controls playsInline className="w-full rounded-md" />
) : (
  <>
    {clip.videoUrl && (
      <video
        ref={videoRef}
        src={clip.videoUrl}
        muted
        loop
        playsInline
        poster={clip.imageUrl}
        className="w-full rounded-md"
      />
    )}
    <audio
      ref={audioRef}
      src={clip.url}
      controls
      onPlay={syncPlay}
      onPause={syncPause}
      onSeeked={syncSeek}
      onEnded={() => videoRef.current?.pause()}
    />
  </>
)}
```

(Keep the existing refs/handlers used by the fallback branch. The combined `<video>` needs no muting — it carries the embedded audio.)

- [ ] **Step 2: Surface lip-sync status**

Next to the existing video status label, show lip-sync progress when running/errored, matching the file's existing status style (e.g. a small line reading `lip-sync: running` / `lip-sync: skipped` based on `clip.lipsyncStatus`/`clip.lipsyncPhase`). Use the same iconography already imported in this file.

- [ ] **Step 3: Typecheck + build + full suite**

Run: `pnpm typecheck && pnpm build && pnpm test:run`
Expected: typecheck 0 errors; build succeeds; all tests pass.

- [ ] **Step 4: Manual verification**

Run `pnpm dev`; with a fal key and video mode on, run a short brief:
1. A scene produces a single combined `<video>` that plays with sound and shows lip motion on the lead face.
2. Audio-only mode (video off) is unchanged.
3. If LatentSync fails for a clip (e.g. faceless narrator scene), that clip falls back to the muted-video + audio player and shows "lip-sync: skipped"; other clips still combine.

(No fal key is available in the implementer's environment — this manual step is a human follow-up; note that in the report.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ClipCard.tsx
git commit -m "feat(ui): play combined lip-synced clip with separate-playback fallback"
```

---

## Self-Review Notes

- **Spec coverage:** LatentSync wrapper (T2) ✓; lipSyncScene step (T3) ✓; per-scene fuse after audio+video, independent failure, scoped `lipsync:` (T4) ✓; fold into video mode / runs only when both inputs exist (T4) ✓; store wiring + regen (T5) ✓; ClipCard single combined player + fallback (T6) ✓; clip lipsync fields + cost (T1) ✓; no planner/audio change (nothing touches guide.ts/plan.ts) ✓.
- **Type consistency:** callback names `onLipSyncStart`/`onLipSyncPhase`/`onLipSync`, clip fields `lipsyncUrl`/`lipsyncStatus`/`lipsyncPhase`, and `lipSyncScene(videoUrl, audioUrl, onPhase?)` are used identically across T1/T3/T4/T5/T6.
- **Placeholder scan:** none — every code step shows concrete code; T6 Step 2 references the file's existing status style rather than inventing new copy, consistent with how video status is already rendered.
- **Risk (from spec):** cartoon-animal faces may sync poorly / fail — covered by the graceful fallback in T4/T6; verified manually in T6 Step 4.
```
