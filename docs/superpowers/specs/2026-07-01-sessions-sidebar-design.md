# Sessions + Sidebar — Design Spec

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan

## Summary

Persist each generation as a **session** in `localStorage` and list sessions in a left
**sidebar** (chat-history style). A session captures the brief + plan + category + clips so a
user can reopen a past run and see its results. "+ New" starts a fresh run; clicking a session
restores it; sessions can be renamed and deleted. Only JSON metadata + fal URLs are stored (no
media blobs), so storage stays small.

Everything stays client-side, BYOK, no backend.

## Decisions (locked)

1. **Session lifecycle:** each **Generate** creates a new session (auto), titled from the brief
   (first ~40 chars), and makes it active. Editing the brief and regenerating **updates the
   active session** (does not spawn a new one); "+ New" clears state and drops the active
   session. `regenScene` updates the active session's clips.
2. **What is stored:** the full run state as fal **URLs** (brief, plan, category, clips with
   their audio/video/lipsync/image URLs). Media blobs are NOT downloaded. fal CDN URLs may
   expire over time — an expired clip shows a small "media link expired — regenerate" note.
3. **Storage:** `localStorage` keys `seed-audio-studio:sessions` (Session[]) and
   `seed-audio-studio:activeSession` (id string | absent).
4. **Sidebar:** newest-first list, active item highlighted, "+ New" button, per-item rename +
   delete (delete confirms). Collapsible on narrow screens.

## Non-Goals

- Downloading/persisting media blobs (IndexedDB) — URLs only.
- Cross-device sync / any backend.
- Session search, tags, or folders.

## Architecture

### Layout

A narrow sidebar column is added to the LEFT of the existing two-column main
(inputs | results), making the screen three columns. On narrow screens the sidebar is hidden
behind a toggle (hamburger) button in the header.

```
[ Sessions | Brief+library | Status+clips ]
```

### Data

`src/lib/types.ts` — new `Session`:

```ts
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  brief: Brief
  plan: Plan | null
  category: string | null
  clips: Clip[]
}
```

### Store (`src/store/useStore.ts`)

New state: `sessions: Session[]` (loaded from localStorage), `activeSessionId: string | null`.

New actions:
- `newSession()` — clears results + resets brief to default + `activeSessionId = null` (this is
  what the "+ New" button calls; supersedes the old `clearResults` for the UI).
- `loadSession(id)` — sets `brief/plan/category/clips` from the stored session and marks it
  active; `status` becomes `'done'` if it has clips, else `'idle'`.
- `renameSession(id, title)` — updates title + `updatedAt`, persists.
- `deleteSession(id)` — removes it; if it was active, behaves like `newSession()`.

Persistence seam — a private `saveActiveSession()` helper snapshots the current
`brief/plan/category/clips` into the active session (creating it on first save of a run) and
writes `sessions` + `activeSessionId` to localStorage:
- `runStudio`: at generation start, decide by `activeSessionId` — if it is `null`, create a new
  session (title from `brief.idea`) and make it active; if it is set (a session is loaded/active),
  reuse it (update in place). Then call `saveActiveSession()` as clips update (on
  `onScene`/`onSceneVideo`/`onLipSync` and at the end) so progress persists. Concrete rule: "+ New"
  sets `activeSessionId = null`, so the very next Generate always starts a fresh session; editing
  the brief of a loaded/active session and regenerating updates that same session.
- `regenScene`: call `saveActiveSession()` after the clip patches settle.

Follow the existing library-persistence pattern (`loadX`/`saveX` helpers, dedupe/replace by id,
newest-first).

### UI

- `src/components/SessionSidebar.tsx` (new) — reads `sessions`/`activeSessionId`, renders the
  "+ New" button and the list (title, relative time), highlights the active item, and offers
  rename (inline or prompt) + delete (confirm) per item. Uses existing `ui.tsx` primitives and
  icons already used elsewhere.
- `src/screens/Studio.tsx` — mount `<SessionSidebar />` as the left column; add a header toggle
  to show/hide it on narrow screens; keep the existing inputs/results columns.
- `src/components/ClipCard.tsx` — on media load error (`onError` of the `<video>`/`<audio>`),
  show a small "media link expired — regenerate" note (covers reopened old sessions with dead
  URLs).

## Error handling

- Corrupt/oversized localStorage: `loadSessions()` tolerantly returns `[]` on parse failure
  (mirrors `loadLibrary`). Writes are wrapped so a `QuotaExceededError` surfaces a single toast
  ("Storage full — delete old sessions") rather than throwing into the pipeline.
- Deleting the active session resets to a clean "+ New" state.

## Testing (Vitest)

- `useStore` session actions (jsdom + localStorage): `runStudio` creating/updating the active
  session; `newSession` clearing state; `loadSession` restoring brief/plan/clips; `renameSession`
  and `deleteSession` (including delete-active → reset); persistence to the exact localStorage
  keys and newest-first ordering.
- Title derivation from `brief.idea` (truncation + "Untitled" fallback for empty).

## Storage note

Sessions hold prompts + URLs (a few KB each). localStorage (~5MB) comfortably holds many; the
`QuotaExceededError` path + manual delete are the release valve. No soft cap is imposed in v1.
