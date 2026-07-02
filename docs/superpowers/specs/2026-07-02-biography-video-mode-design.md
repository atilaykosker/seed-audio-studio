# Biography Video Mode — Design

Date: 2026-07-02
Branch: feat/av-studio
Builds on: the Video-First Studio pivot (2026-07-02-video-first-studio-design.md)

## Motivation

Alongside the existing multi-character *story* pipeline, the studio needs to produce
**biographies**: a subject's life story told as a sequence of cinematic **silent** shots
(see `SAMPLE_BIOGRAPHY.md` — Cristiano Ronaldo, page-by-page shot breakdown). Narration
is added **externally by the user**, so the app generates *visuals only* — no dialogue,
no lip-sync, no native audio. The app's job: from a one-line brief about a person, have
the LLM write an enriched, video-ready shot breakdown, then render each shot as a short
silent clip with strong visual consistency across the subject's life stages.

Decision drivers (from brainstorming):
- **Silent video only.** Audio/narration is handled externally; never generate audio.
- **Generate from a brief.** The LLM enriches a subject into video-ready prompts (not an
  import of a pre-written breakdown — that is out of scope for v1).
- **Age-stage character consistency.** The same person (child → teen → adult) must look
  consistent: the LLM defines life stages, one reference portrait is minted per stage,
  and each shot is conditioned on its stage's portrait.
- **User picks a uniform shot duration** (no target-length parameter); the LLM decides how
  many pages/shots the life story needs.

## Scope

A new **content type** selectable in the studio: `story` (existing) or `biography` (new).
Biography reuses the video-first plumbing (character images → keyframe → i2v video, the
model picker, sessions, cost) with a biography-specific planner, a silent render path, and
a page-grouped results view.

Out of scope for v1 (all handled by the user externally, consistent with "audio elsewhere"):
- Stitching shots into one continuous film (concat).
- An end card / title card.
- Importing a hand-written breakdown (generate-from-brief only).
- Any audio/TTS/mux.

## Data model (new types)

```ts
/** One life stage of the subject, e.g. "child ~10" / "teen ~15" / "adult". */
interface BioStage { id: string; label: string; appearance: string }

/** One silent shot; conditioned on its stage's reference portrait when set. */
interface BioShot { id: string; stageId?: string; visual: string }

/** A narration block (external-audio metadata) with the shots shown under it. */
interface BioPage { id: string; index: number; narration: string; shots: BioShot[] }

interface BiographyPlan {
  subject: string
  /** Global visual style applied to every portrait, keyframe, and shot prompt. */
  style: string
  stages: BioStage[]
  pages: BioPage[]
}
```

`Brief` gains:
- `type: 'story' | 'biography'` (default `'story'`).
- `shotSec: number` — the uniform per-shot duration for biography (a model-valid value;
  default 8). No target-length field is used by biography.

`Session` persists the content type and, for biography runs, the `BiographyPlan`
(alongside the existing story `plan`). The store holds `bioPlan: BiographyPlan | null`
next to `plan`.

Clips are reused unchanged: one `Clip` per shot (`sceneId = shot.id`, `title =
"Page N · Shot M"`, `prompt =` the composed silent video prompt, `videoUrl` = the result).
Page grouping + narration in the UI are derived from `bioPlan`, so `Clip` needs no new
fields.

## Planner

`guide.ts` gains `BIOGRAPHY_GUIDE` + `BIO_OUTPUT_DIRECTIVE`. The guide instructs the LLM to:
- Produce a **global `style`** line (painterly/cinematic/etc., steerable by the user's
  optional genre hint) reused across the whole piece for visual cohesion.
- Split the subject into a small set of **life `stages`** (id, human label with approx age,
  and an `appearance` describing that stage's look).
- Write **`pages`**, each with a first-person/narrator **`narration`** block (the script
  the user will voice externally) and 2–3 **`shots`**, each a concrete, video-ready
  **`visual`** (setting, framing, camera move, lighting, action) tagged with the `stageId`
  it depicts (omit `stageId` for pure-atmosphere shots).
- Decide the natural number of pages/shots for the life story (no fixed length).
- Emit NO per-shot durations (the app applies the user's uniform `shotSec`).
- Avoid readable text, subtitles, real logos (matching the sample's constraints).

`plan.ts` gains `makeBioPlan(brief, model, opts?)` and `parseBioPlan(text)` mirroring the
story `makePlan`/`parsePlan` (tolerant JSON extraction, one strict-JSON retry). `parseBioPlan`
assigns `id`s (stages, shots, pages) via `uid`, drops stages without a label/appearance and
shots without a `visual`, and throws when there are no pages/shots.

## Render pipeline

`generateBiography(plan, args, cb)` where `args = { characterLibrary?, videoModel, aspect,
shotSec }`:
1. Build `stageImageByKey` from the reusable character library (key
   `"${subject} — ${stage.label}"`, lowercased). Mint one reference portrait per **missing**
   stage via `mintStageImage(subject, stage, style)` and add it to the library.
2. For each page → each shot, in order:
   - `bioKeyframe(shot, stageImageUrl, style, aspect)` — a style-consistent establishing
     frame conditioned on the shot's stage portrait (when the shot has a stage).
   - **Silent** video: `generateSceneVideo` variant that forces `generate_audio: false`
     regardless of the selected model, with `durationSec = shotSec`, `aspect`, and a prompt
     of `style + shot.visual` (no narration — audio is external).
   - Report progress via the existing `GenerateCallbacks` (`onCharacterImage`,
     `onSceneStart`, `onKeyframe`, `onScenePhase`, `onScene`, `onError`).

`image.ts` gains:
- `mintStageImage(subject, stage, style)` → a reference portrait prompt embedding the
  global `style` + stage `appearance` (returns a `CharacterImage` named
  `"${subject} — ${stage.label}"`).
- `bioKeyframe(shot, stageImageUrls, style, aspect)` → keyframe prompt embedding `style` +
  `shot.visual`, conditioned on the stage portrait when present.

`fal/client.ts` `buildVideoInput` / `nativeVideo` gain a `forceSilent?: boolean` (or the
biography render passes an explicit `generate_audio:false`) so a silent clip is produced on
any model tier — including the native-audio ones (Veo/Seedance) used for their visual
quality. Kling is already silent.

## Cost

`cost.ts` gains `estimateBioCost(plan, videoModel, shotSec)` =
`stages.length * IMAGE_EACH + totalShots * shotSec * pricePerSec`. Silent generation is
cheaper on Veo (audio-off pricing ≈ $0.20/s vs $0.40/s) — the estimate uses the model's
per-second price; if a distinct silent price matters later it can be added to the registry,
but v1 uses the single `pricePerSec` as an upper bound.

## UI

- **BriefForm** gets a content-type toggle (**Story | Biography**) at the top, bound to
  `brief.type`. In **Biography** mode: the idea textarea is labelled for a subject
  ("Who? — the person + any focus/era"), a **Shot duration** Select (e.g. 4s / 6s / 8s,
  clamped per model) replaces the target-length slider, the speakers control is hidden,
  and Orientation + the `VideoModelPicker` + Language (narration language) + optional style
  hint remain. Generate button reads "Generate biography".
- **Results (biography):** ClipCards are **grouped by page**; each page shows its
  `narration` text above its shots with a **Copy** button (so the user can lift the script
  for the external VO). A **Copy full script** action concatenates all pages' narration.
  ClipCard itself is reused unchanged (renders the silent video).
- **SettingsDialog / SessionSidebar:** unchanged; sessions list biography runs like any
  other.

## Files touched

- `types.ts` — `BioStage`/`BioShot`/`BioPage`/`BiographyPlan`; `Brief.type`, `Brief.shotSec`;
  `Session` persists type + `bioPlan`.
- `guide.ts` — `BIOGRAPHY_GUIDE` + `BIO_OUTPUT_DIRECTIVE`.
- `plan.ts` — `makeBioPlan` + `parseBioPlan`.
- `image.ts` — `mintStageImage` + `bioKeyframe`.
- `video.ts` / `fal/client.ts` — silent render option (`forceSilent`) + a bio prompt builder.
- `generate.ts` — `generateBiography`.
- `cost.ts` — `estimateBioCost`.
- `useStore.ts` — `bioPlan` state, `brief.type` branch in `runStudio`/`regenScene`, session
  persistence.
- `BriefForm.tsx` — content-type toggle + biography fields (shot-duration select, subject
  labelling, hide speakers/target-length).
- `Studio.tsx` — page-grouped biography results + narration display + copy actions.

## Testing

- Unit: `parseBioPlan` (stages/pages/shots shape, id assignment, drop-invalid, throw-on-empty);
  `makeBioPlan` prompt/schema shape; `mintStageImage`/`bioKeyframe` embed style + stage;
  `buildVideoInput` with `forceSilent` yields `generate_audio:false` on a native-audio model;
  `estimateBioCost` math; `generateBiography` orchestration (mint only missing stage
  portraits, keyframe+silent-video per shot, `onScene` per shot) with `./image`/`./video`
  mocked.

## Constraints to respect

- **Silent always** in biography — never request audio, never send narration to the model.
- **Min clip duration:** models can't go below ~4s (Veo steps 4/6/8; Kling ≥5s). The
  `shotSec` selector only offers model-valid values and `buildVideoInput` clamps; a shot
  renders at the chosen uniform duration. The user trims/overlaps under the narration when
  assembling externally.
- **Character consistency** flows subject → per-stage portrait → keyframe → i2v start frame;
  the global `style` string is threaded into every portrait, keyframe, and shot prompt.
- Reuse the existing video-first services (model registry, `nativeVideo`, keyframe, sessions,
  cost) rather than parallel copies; biography adds a planner, a silent render path, and a
  grouped results view.
