# Video-First Studio (Veo / Seedance native-audio pivot) — Design

Date: 2026-07-02
Branch: feat/av-studio

## Motivation

The current AV pipeline is a fragile three-stage chain: seed-audio (voices + per-scene
audio) → kling v3 i2v (silent video) → LatentSync lip-sync (fails with
`face_detection_error` on stylized / animal / faceless shots) → ffmpeg mux fallback.

Modern video models (Veo 3.1, Seedance 2.0) now generate **synchronized native audio**
— dialogue with lip-sync, ambient sound, SFX, music — in a single pass. This lets us
delete the entire separate-audio + lip-sync layer and make the studio video-first: one
model call per shot produces the finished, audible clip.

Decision drivers (from brainstorming):
- Focus on **video generation**; audio comes **from the video model** (Veo native).
- **Visual character consistency** matters; cross-scene *voice-identity* consistency is
  accepted as best-effort only (models cannot pin a voice).
- Provide a **model / quality selector** (premium ↔ cheap/fast).

## What is removed

Retired on this branch (git history preserves it — clean cut, not dormant code):
- `mintVoice`, the Voice Library, and the `refPrompt` / `voiceSpec` character fields.
- Per-scene seed-audio generation (the audio path in `generateScene`).
- `lipSyncScene` → `latentSync` + `mergeAudioVideo` (all lip-sync / mux logic).
- `src/services/audio/trim.ts` (only existed to trim minted voices).
- seed-audio / latentSync / merge-audio-video endpoints + client fns in `client.ts`.

## What is kept (unchanged)

- Plan stage: `plan.ts` + `guide.ts` still produce `category`, `characters`, `scenes`.
- Character images + Image Library: `mintCharacterImage`, reuse-by-name.
- Scene keyframe: `sceneKeyframe` (composes present characters into a start frame).
- Character **visual** consistency flows character images → keyframe → i2v start frame.

## New pipeline

```
plan
  → for each character: mint or reuse character image
  → for each scene (shot):
        sceneKeyframe(scene, present character images)
        → nativeVideo(selectedModel, { prompt, startImageUrl: keyframe,
                                        durationSec, aspectRatio, generateAudio: true })
        → combined clip (video + audio) = scene output
```

No lip-sync, no separate audio, no mux, no concat step. The model's clip is the output.

## Model / quality selector

A `VIDEO_MODELS` registry in `client.ts`, each entry: `{ id (endpoint), label,
pricePerSec, maxDurationSec, aspectRatios, audio }`. Five tiers, all image-to-video:

| Tier | Endpoint | ~$/sec (720p) | Max dur | Native audio |
|------|----------|--------------|---------|--------------|
| Veo 3.1 (high) | `fal-ai/veo3.1/image-to-video` | $0.40 w/ audio | 8s | yes |
| Veo 3.1 Fast | `fal-ai/veo3.1/fast/image-to-video` | ~$0.25 | 8s | yes |
| Seedance 2.0 (balanced, default) | `bytedance/seedance-2.0/image-to-video` | ~$0.30 | 8s | yes |
| Seedance 2.0 Fast (cheap) | `bytedance/seedance-2.0/fast/image-to-video` | ~$0.24 | 8s | yes |
| Kling v3 Pro (silent, long) | `fal-ai/kling-video/v3/pro/image-to-video` | ~$0.10 | 15s | **no** |

Kling produces **silent** clips (no dialogue/audio); it stays as a longer-duration
(≤15s), lower-cost, motion-quality option. The registry's `audio` flag drives UI and
prompt behaviour: `audio: false` models skip the dialogue-in-prompt formatting and their
output has no sound (accepted per the "cheap/silent models give silent clips" decision).

> Exact endpoint ids, param names (e.g. `generate_audio`, `aspect_ratio`, `resolution`,
> `duration`), and prices are confirmed against fal model docs during implementation.

Each `VIDEO_MODELS` entry also carries a short `description` (one line: what it's good
for / tradeoff). The picker **displays label + description + price ($/sec)** next to
every option (and native-audio vs silent), so the user sees the cost/quality tradeoff at
selection time. Estimated per-shot cost (price × duration) is also surfaced.

Store adds `videoModel` state, persisted to `localStorage` alongside `llmModel` /
fal key (voice library persistence is removed). UI: a picker in `Studio` (near the run
control / settings). Default = Seedance 2.0.

`nativeVideo(endpoint, opts)` is a generic fal wrapper that dispatches to any of the four
endpoints (they share the i2v + audio shape); model-specific param mapping lives behind
it. Replaces `klingVideo`.

## Character & voice consistency

- **Visual:** unchanged — keyframe conditioned on character images drives the i2v start
  frame, giving consistent appearance across shots.
- **Voice:** models cannot pin a voice identity across clips. Mitigation: embed a fixed
  per-character voice description into every shot prompt (e.g. "Rio, a young girl with a
  bright high voice, says: …"). Best-effort only — documented as a known limitation.

## Critical constraint: shot duration

Veo / Seedance cap generation at **≤8 seconds per clip** (kling allows ≤15s).
`durationSec` clamps to the selected model's `maxDurationSec`. Planning targets **≤8s
shots** so a story renders on any tier. A "scene" therefore becomes a
**≤8s shot**. `guide.ts` system prompt is rewritten to emit short shots, each with: a
visual direction, a dialogue line (the exact spoken text), and the speaking character's
fixed voice description. A longer story = a sequence of ≤8s shots. (No automatic video
concatenation in this iteration; shots are produced and shown per-scene, as today.)

## Aspect ratio / resolution

Minimal: a landscape/portrait (16:9 / 9:16) toggle, default 720p to control cost.

## Files touched

- `guide.ts` — system prompt: voice-spec → dialogue + visual direction + voice description; shots ≤8s.
- `types.ts` — `Character` drops `voiceSpec`/`refPrompt`; `Scene` gains a dialogue field; clip-status enum simplifies (no audio/lipsync states).
- `plan.ts` — `parsePlan` adjusted to the new character/scene shape.
- `generate.ts` — remove voice-mint / scene-audio / lip-sync paths; orchestrate image → keyframe → nativeVideo.
- `video.ts` — replace `generateSceneVideo`/`buildElementPrompt` with the nativeVideo dispatch (single start image, no `@Element` renumbering); nativeVideo handles all five tiers incl. kling.
- `client.ts` — add Veo + Seedance endpoints, `VIDEO_MODELS`, and `nativeVideo` (which also routes the retained kling endpoint); remove `seedAudio`, `latentSync`, `mergeAudioVideo`, and the standalone `klingVideo` fn.
- `cost.ts` — per-second video pricing by selected model (replaces seed-audio $/min).
- `useStore.ts` — simplify `GenerateCallbacks` (drop voice/audio/lipsync); add `videoModel`; sessions store the model used.
- `Studio.tsx` + affected components — model picker, aspect toggle, remove voice-library / lip-sync UI.
- Delete `audio/trim.ts` (and its tests).

## Testing

- Unit: `VIDEO_MODELS` registry + `nativeVideo` param mapping per model; `cost.ts` per-model math; `plan.ts` parse of the new shape; `guide.ts` prompt still yields valid JSON with `characters` + `scenes`.
- Update/remove existing tests tied to seed-audio / latentSync / trim / kling element prompt.

## Known limitations (documented, not fixed here)

- Cross-shot voice identity is best-effort (prompt-described, not pinned).
- Max 8s per shot; no automatic multi-shot stitching this iteration.
- Cost is dominated by video seconds; a full story of N shots ≈ N × 8s × model $/sec.
