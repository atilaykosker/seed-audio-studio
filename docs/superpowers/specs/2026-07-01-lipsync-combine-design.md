# Lip-sync Combine — Design Spec

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Builds on:** `2026-07-01-av-studio-design.md` (video mode)

## Summary

In video mode, fuse each scene's silent kling video and its seed-audio clip into a **single
lip-synced video file** via fal `fal-ai/latentsync` (video_url + audio_url → one MP4 with the
audio embedded and the lead face's lips synced to the words). This replaces the current
"separate muted `<video>` + `<audio>` played in sync" with one combined clip. Audio scene
structure is unchanged — scenes stay multi-speaker; LatentSync corrects the most prominent
face while kling keeps the other characters visibly talking.

Everything stays client-side, BYOK, no backend.

## Decisions (locked)

1. **Model:** `fal-ai/latentsync` (ByteDance). ~$0.2 flat for ≤40s (our scenes ≤15s).
2. **No audio splitting.** Scenes remain multi-speaker as today — the planner/guide is NOT
   changed. LatentSync syncs one face; kling's generic mouth motion covers the rest.
3. **Fold into video mode.** When `Brief.withVideo` is true, every scene that produced both a
   kling video and an audio clip gets a LatentSync pass automatically. No new toggle.
4. **Graceful fallback.** If LatentSync fails (e.g. no detectable face on a narrator/atmospheric
   shot, or an API error), that clip keeps its separate `videoUrl` + `url` and uses the existing
   muted-video + audio synced playback. Other scenes are unaffected.
5. **Output:** the combined clip has embedded audio → ClipCard plays a single `<video controls>`
   (not muted, no separate `<audio>`). Non-combined clips keep today's behavior.

## Non-Goals

- Single-speaker scene splitting / per-character perfect lip-sync (explicitly rejected — too
  many clips, choppy audio, high cost).
- ffmpeg.wasm muxing.
- Lip-syncing every face in a multi-character shot (only the lead face; others keep kling motion).

## Verified fal facts

**`fal-ai/latentsync`** (video-to-video lip-sync)
- Input: `video_url` (required), `audio_url` (required); optional `guidance_scale`, `seed`,
  and a loop mode for when audio is longer than the video (`loop` / `pingpong`).
- Output: `{ video: { url, content_type: 'video/mp4', ... } }` (audio embedded).
- Price: ~$0.2 for videos ≤40s, then ~$0.005/s.

## Architecture

### Data flow (per scene, video mode)

```
seed-audio → audio clip (url, durationSec)          [existing]
nano-banana → character image + scene keyframe       [existing]
kling i2v (generate_audio:false) → silent video      [existing]
latentSync(video_url=kling, audio_url=seed-audio) → combined lip-synced MP4   [NEW]
  ↳ on success: clip.lipsyncUrl set → ClipCard plays the single combined video
  ↳ on failure: scoped error 'lipsync:<sceneId>', clip keeps videoUrl+url (separate playback)
```

Audio, image, video, and lip-sync steps fail independently. LatentSync runs only after BOTH
the scene's audio and kling video succeeded (needs both inputs); otherwise it is skipped.

### New/changed files

- `src/services/fal/client.ts` — add `latentSync({ videoUrl, audioUrl }, opts?): Promise<{ url }>`
  and `ENDPOINTS.latentSync = 'fal-ai/latentsync'`; default timeout `TIMEOUTS.video` (600s).
  Output mapping mirrors `klingVideo` (`data.video.url`).
- `src/services/studio/video.ts` — add `lipSyncScene(videoUrl, audioUrl, onPhase?): Promise<{ url }>`
  wrapping `latentSync` (single responsibility; keeps `generateSceneVideo` untouched).
- `src/services/studio/generate.ts` — after a scene's video AND audio both succeed in video
  mode, call `lipSyncScene`; report via new callbacks `onLipSyncStart/Phase/LipSync`; a failure
  routes to `cb.onError('lipsync:'+sceneId, msg)` (independent).
- `src/store/useStore.ts` — wire the new callbacks to clip fields; extend `regenScene` to
  re-run the lip-sync step after a successful video regen.
- `src/lib/types.ts` — `Clip.lipsyncUrl?: string`, `Clip.lipsyncStatus?: ClipStatus`,
  `Clip.lipsyncPhase?: 'queued' | 'running' | 'done'`.
- `src/lib/cost.ts` — add ~$0.2 per scene to the estimate when `withVideo`.
- `src/components/ClipCard.tsx` — when `clip.lipsyncUrl` exists, render a single
  `<video controls src={lipsyncUrl}>` (with sound); otherwise keep the current muted-video +
  synced-audio fallback. Surface `lipsyncStatus`/`lipsyncPhase` next to the video status.

### Orchestration detail (generate.ts)

Per scene, after the existing audio + video steps:

```
if (withVideo && audio succeeded && video succeeded) {
  onLipSyncStart(sceneId)
  try {
    const { url } = await lipSyncScene(videoUrl, audioUrl, phase → onLipSyncPhase)
    onLipSync(sceneId, url)          // clip.lipsyncUrl = url, lipsyncStatus 'done'
  } catch (e) {
    onError('lipsync:'+sceneId, msg) // lipsyncStatus 'error'; clip falls back to separate playback
  }
}
```

The audio `url` and kling `videoUrl` must be captured in the scene loop to feed LatentSync.

## Error handling

- LatentSync wrapped; failure → `FriendlyError` via `mapFalError`, clip `lipsyncStatus:'error'`,
  and the clip remains playable via the separate video+audio fallback. No raw throw.
- Timeout/abort already handled by the shared `run()` timeout (video tier, 600s).
- Faceless scenes (pure narrator/atmosphere) are expected to sometimes fail LatentSync — that
  is a normal fallback path, not a hard error surfaced aggressively (toast optional/low-key).

## Risk

- LatentSync is trained on human faces; **stylized cartoon-animal faces may sync poorly or fail
  detection.** The graceful fallback (separate playback) covers failures, but sync quality on
  non-human characters is uncertain and can only be judged by running it. Acceptable given the
  fallback; revisit model choice if quality is unusable.

## Testing (Vitest, pure logic)

- `client.ts`: `latentSync` builds `{ video_url, audio_url }`, maps `data.video.url`, uses the
  video timeout (mock `fal.subscribe`).
- `video.ts`: `lipSyncScene` passes video/audio through and wires `onPhase`.
- `generate.ts`: in video mode, `lipSyncScene` is called with the scene's video+audio urls only
  when both succeeded; a lip-sync failure emits `lipsync:<id>` and does NOT clear the audio/video
  results; skipped entirely when `withVideo` is false or the video step failed.
- `cost.ts`: estimate includes the per-scene LatentSync term when `withVideo`.

## Cost (surface pre-generation)

- +~$0.2 per scene (LatentSync), on top of kling (~$1.12/scene) + nano-banana (~$0.039/image).
- Example (4 scenes, 3 characters): prior ≈ $4.7 → now ≈ $5.5/run.
```
