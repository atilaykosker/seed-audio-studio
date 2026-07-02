# Editable Prompt + Regenerate — Design

Date: 2026-07-02
Branch: feat/av-studio

## Motivation

A generated shot can fail (e.g. fal's content-policy filter flags a benign prompt) or
just look wrong. Today `Regenerate` re-runs a clip with the plan's fixed prompt, so the
user can only retry the same text. They want to **edit the prompt in the UI and regenerate
with the edited text** — the direct fix for a flagged prompt (reword it and retry) and a
general creative-control lever.

## Behaviour

The ClipCard "Prompt" disclosure becomes an editable `<textarea>` seeded with the clip's
current `prompt`. When the user hits **Regenerate**, whatever text is in the box is sent to
the model **verbatim** as the driving prompt (keyframe + video). "What you type is what's
generated."

Per-mode semantics (from the "edit the raw combined prompt" decision):
- **Biography:** the edited text replaces the shot's `visual`. The keyframe and the silent
  video are built from that text (+ the global style) — a clean 1:1 mapping.
- **Story:** the edited text replaces the scene's `visual` AND clears the scene's
  `dialogue`. So the regenerated clip's model prompt is exactly the edited text (no
  separately re-appended dialogue). If the user wants spoken lines, they write them into
  the text and the audio-capable model still voices them. Consequence: structured
  per-character voice-consistency is disabled for an edited story regen — the accepted
  trade-off of manual prompt editing.

The edit is persisted into the plan/bioPlan and the active session, so it survives reload
and shows in the textarea after regeneration.

## Data model

No type changes. `Clip.prompt` (already exists) is the editable value. The edit is written
back to the source of truth: `Scene.visual` (story) / `BioShot.visual` (biography), so the
existing `regenScene` path picks it up unchanged.

## Store

New action `editClipPrompt(sceneId: string, text: string)`:
- Sets that clip's `prompt = text`.
- **Biography** (`bioPlan` set): find the shot with `id === sceneId`, set `shot.visual = text`.
- **Story** (`plan` set): find the scene with `id === sceneId`, set `scene.visual = text`
  and `scene.dialogue = ''`.
- Calls `saveActiveSession()`.

`regenScene` is unchanged — it already reads `scene.visual`/`shot.visual` (and, for story,
`scene.dialogue`) from the plan, which now reflects the edit.

## UI

`ClipCard`:
- The Prompt disclosure renders a controlled `<textarea>` bound to a local draft state
  seeded from `clip.prompt`, kept in sync when `clip.prompt` changes (e.g. after regen or
  loading a session) via an effect on `clip.prompt`.
- The existing **Regenerate** button first commits the draft (`editClipPrompt(clip.sceneId,
  draft)`) then calls `regenScene(clip.sceneId)`. No extra buttons.
- The disclosure stays a toggle; when collapsed nothing changes visually beyond the readonly
  `<pre>` becoming an editable box when open.

## Files touched

- `src/store/useStore.ts` — add `editClipPrompt` (+ to the `Store` interface).
- `src/components/ClipCard.tsx` — editable textarea + regenerate-commits-edit.

## Testing

- Unit (store): `editClipPrompt` on a biography clip sets the matching `shot.visual` to the
  text and updates `clip.prompt`; on a story clip sets `scene.visual` to the text, clears
  `scene.dialogue`, and updates `clip.prompt`.

## Out of scope (YAGNI)

- A "reset to original" button.
- Editing story dialogue as a separate field.
- Bulk / multi-clip prompt edits.

## Constraints to respect

- No content-policy evasion: this is user-authored prompt editing, not automated filter
  bypass. Real public-figure likenesses may still be blocked by the image model regardless
  of wording — that is expected and not something the app works around.
- Keep the existing `regenScene` reset/error handling; `editClipPrompt` only mutates the
  plan/clip and persists.
