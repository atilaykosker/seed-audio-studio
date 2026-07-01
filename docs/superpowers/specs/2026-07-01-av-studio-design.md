# Seed Audio Studio → A/V Studio — Design Spec

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan

## Summary

Extend the audio-only Seed Audio Studio into an audio **+ visual + video** studio. In
addition to the existing multi-voice audio pipeline, an opt-in "video" mode generates a
consistent character image per character (fal `nano-banana`), a per-scene establishing
image, and a short video per scene (fal `kling-video/v3/pro/image-to-video`) that keeps
characters/objects consistent across clips via kling's `elements` (`@Element1..3`) feature.

Everything stays client-side, BYOK, no backend, static deploy — the existing architecture.

## Goals

- Reuse the proven audio pipeline and its patterns (LLM plan → mint → generate, Zustand
  store as the UI↔service seam, `GenerateCallbacks` progress, `mapFalError`).
- Add a **Character Library** (persistent character images) mirroring the existing Voice
  Library.
- Per scene: produce audio (existing) + a scene keyframe image + a kling video clip.
- Keep audio-only mode 100% intact and default — video is opt-in per run.
- Preserve character/object consistency across video clips using kling `elements`.

## Non-Goals

- Lip-sync / audio-driven avatars (explicitly dropped — "kling bize ne verirse onu
  kullanalım"). Kling's own motion/output is accepted as-is.
- Muxing audio+video into a single MP4 (no ffmpeg.wasm). Playback syncs the two streams in
  the player; downloads are separate files.
- Any server-side rendering, auth, or storage.

## Decisions (locked)

1. **Video model strategy:** kling v3 pro image-to-video only. No lip-sync, no avatar
   models.
2. **Scene length:** in video mode, each scene's audio ≤ 15s (one kling clip). The planner
   splits more aggressively; audio-only mode keeps the current ~2min/split-at-90s rule.
3. **Audio/video combine:** player-level sync — kling video generated silent
   (`generate_audio: false`), rendered muted, driven from the same transport as the
   seed-audio `<audio>`; both play/seek together. No ffmpeg.
4. **Video is opt-in:** a `withVideo` toggle on the Brief, default OFF (cost ~6× higher).
5. **Consistency:** the same nano-banana character image is reused across scenes and passed
   as a kling `element`; the scene keyframe is the kling `start_image_url`.

## Verified fal model facts

**`fal-ai/nano-banana`** (image gen / edit)
- Input: `prompt` (string), `aspect_ratio` (e.g. "1:1", "16:9"). Multi-image/reference edit
  is supported via the model family (confirm exact endpoint — likely
  `fal-ai/nano-banana/edit` for image-conditioned generation).
- Output: `{ images: [{ url, content_type }], description }`.
- Price: ~$0.039/image.

**`fal-ai/kling-video/v3/pro/image-to-video`**
- Input: `start_image_url` (required), `prompt`, `duration` ("3"–"15" sec, default "5"),
  `generate_audio` (bool, default true → we set **false**), `elements`
  (`{ frontal_image_url, reference_image_urls? }[]`, referenced as `@Element1..` in prompt),
  `negative_prompt`, `cfg_scale`, optional `end_image_url`.
- Aspect ratio is determined by the start image (not a parameter).
- Output: `{ video: { url, content_type: "video/mp4", file_name, file_size } }`.
- Price: ~$0.112/sec with audio off.

## Architecture

### Data flow

```
Brief { ..., withVideo }
  → makePlan (LLM, openrouter/router)
       plan.characters[] : { name, voiceSpec, refPrompt, appearance? }   // appearance = image prompt
       plan.scenes[]     : { id, kind, title, speakers, prompt, visual? } // visual = shot/camera description
  → generateFromPlan:
       for each character missing from libraries:
         mintVoice()            (seed-audio → Voice Library)      [existing]
         mintCharacterImage()   (nano-banana → Character Library) [new, video mode only]
       for each scene:
         seedAudio()            → audio clip                      [existing]
         if withVideo:
           sceneKeyframe()      (nano-banana, using present characters' images) → keyframe image
           generateSceneVideo() (kling v3 i2v, start=keyframe, elements=present chars) → mp4
```

Audio, image, and video for a scene are independent — a video failure must not break audio.
Errors route through `mapFalError` and per-clip status, never a raw throw to the user.

### New/changed files

- `src/services/fal/client.ts` — add `nanoBanana(args)` and `klingVideo(args)`; add both
  endpoints to `ENDPOINTS`. Follow the existing `run()` wrapper + `QueuePhase` progress.
- `src/services/studio/image.ts` (new) — `mintCharacterImage(character)` and
  `sceneKeyframe(scene, presentCharacterImages)`. Uploads results to `fal.storage` for
  persistent URLs. Keep it focused: image concerns only.
- `src/services/studio/video.ts` (new) — `generateSceneVideo(scene, keyframeUrl,
  elementImages)`. Builds the kling input (start image, elements, duration from scene,
  `generate_audio: false`), returns `{ url }`. Single responsibility: one scene → one clip.
- `src/services/studio/generate.ts` — extend orchestration and `GenerateCallbacks` with
  `onCharacterImage`, `onKeyframe`, `onSceneVideoStart/Phase/Video`. Reuse-by-name logic
  mirrors voices. Video steps run only when `withVideo`.
- `src/services/studio/guide.ts` — extend the system prompt: character `appearance` and
  scene `visual` fields, and a video-mode block enforcing ≤15s scenes. Extend
  `OUTPUT_DIRECTIVE` schema accordingly. **Keep the strict single-JSON contract** that
  `parsePlan` depends on; new fields are optional so audio-only parsing is unaffected.
- `src/services/studio/plan.ts` — `buildPlanPrompt` gains a video-mode branch (append the
  ≤15s + visual directives when `withVideo`); `parsePlan` reads the new optional fields.
- `src/lib/types.ts` — `Brief.withVideo: boolean`; `Character.appearance?`; `Scene.visual?`;
  `Voice`-parallel `CharacterImage` type; `Clip` gains `imageUrl?`, `videoUrl?`,
  `videoStatus?`, `videoPhase?`.
- `src/lib/cost.ts` — extend `estimatePlanCost` to add nano-banana (per character + per
  scene) and kling (per-scene seconds) costs when `withVideo`.
- `src/store/useStore.ts` — add `characterLibrary` (localStorage key
  `seed-audio-studio:characters`), `addCharacterImage`/`removeCharacterImage`/
  `clearCharacterLibrary`; wire the new callbacks into `runStudio`; extend `regenScene` to
  optionally regen video; persist nothing new for scene clips (still ephemeral — matches
  current behavior).
- `src/components/ClipCard.tsx` — synced video+audio playback (muted `<video>` + `<audio>`
  from one transport; play/pause/seek together; fall back to audio-only when no video).
- `src/components/BriefForm.tsx` — add the `withVideo` toggle.
- `src/components/CharacterLibraryPanel.tsx` (new, optional) — mirror
  `VoiceLibraryPanel` for character images.

### Consistency mechanism (detail)

- Character image is minted once (nano-banana, frontal), stored in the Character Library,
  reused across runs by name (case-insensitive), exactly like minted voices.
- Per scene, `sceneKeyframe()` composes the present characters into an establishing image
  (nano-banana image-conditioned on those character images) → this is kling `start_image_url`.
- `generateSceneVideo()` passes the present characters as kling `elements`
  (`frontal_image_url` = the character image) so the prompt can reference `@Element1..3` and
  kling holds them consistent through the motion.
- Narrator/no-speaker scenes: empty `elements`, atmospheric keyframe, kling still animates.

## Error handling

- Every network step wrapped; failures produce a `FriendlyError` via `mapFalError` and set
  per-clip `status`/`videoStatus` to `error` with the message. Audio, image, and video fail
  independently. Rate-limit (429) and 5xx are retryable per existing mapping.
- Kling duration must be clamped to [3,15]; scene audio target already ≤15s in video mode.

## Testing

Vitest is configured but currently unused. Add focused unit tests for the pure logic
(no network) introduced here:
- `plan.ts`: `parsePlan` reads new optional `appearance`/`visual` fields and still parses
  legacy audio-only plans.
- `cost.ts`: `estimatePlanCost` with/without `withVideo` produces expected numbers.
- `video.ts`: kling input builder clamps duration, maps present speakers → `elements` in
  order, sets `generate_audio:false`, and omits `elements` for narrator scenes.
- `client.ts` wrappers: mock `fal.subscribe`/`fal.storage.upload`, assert input shaping and
  output mapping.

## Cost (surface in UI before generating)

- nano-banana ~$0.039/image (1 per character + 1 per scene keyframe).
- kling v3 i2v ~$0.112/sec, audio off (~$1.12 per 10s scene).
- Example (4 scenes, 3 characters): ≈ $4.7/run vs ~$0.19/min audio-only.

## Open items to confirm during implementation

- Exact nano-banana endpoint for image-conditioned scene keyframes
  (`fal-ai/nano-banana` vs `fal-ai/nano-banana/edit`) — verify against the live fal schema.
- Kling `duration` enum accepted values and whether `elements` count is capped at 3 (align
  with the existing ≤3-speaker scene rule).
