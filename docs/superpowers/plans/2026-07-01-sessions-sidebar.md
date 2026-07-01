# Sessions + Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each generation as a session in localStorage and list sessions in a left sidebar (chat-history style) with new / open / rename / delete.

**Architecture:** Add a `Session` type and a session layer to the Zustand store (state + persistence + CRUD + `beginSession`/`saveActiveSession`), wire session create/update into `runStudio`/`regenScene`, and render a `SessionSidebar` as the left column of `Studio`. Only JSON metadata + fal URLs are stored (no blobs). fal URLs may expire — ClipCard shows a small note on media load error.

**Tech Stack:** Vite + React 19 + TypeScript + Zustand + Tailwind + Vitest (jsdom, globals).

## Global Constraints

- BYOK, client-side only, no backend; no new runtime dependencies. Path alias `@/` → `src/`.
- localStorage keys: `seed-audio-studio:sessions` (Session[]) and `seed-audio-studio:activeSession` (id).
- Session lifecycle: Generate creates a new session ONLY when `activeSessionId` is null; if a session is active/loaded, Generate updates it. "+ New" sets `activeSessionId = null`. `regenScene` updates the active session.
- Store fal URLs only (no media blobs / IndexedDB).
- Title = brief idea trimmed to ~40 chars, "Untitled" when empty; newest-first list.
- Follow the existing library-persistence pattern (`loadX`/`saveX`, dedupe/replace by id). Tests import from `vitest` explicitly, clear localStorage between tests. Style: 2-space indent, no semicolons, single quotes.

---

### Task 1: Session type + store session layer (state, persistence, CRUD)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.test.ts` (extend)
- Test: `src/lib/utils.test.ts` (create)

**Interfaces:**
- Produces:
  - `Session { id: string; title: string; createdAt: number; updatedAt: number; brief: Brief; plan: Plan | null; category: string | null; clips: Clip[] }`
  - `sessionTitle(idea: string): string`
  - Store: `sessions: Session[]`, `activeSessionId: string | null`, and actions `beginSession()`, `saveActiveSession()`, `newSession()`, `loadSession(id)`, `renameSession(id, title)`, `deleteSession(id)`.

- [ ] **Step 1: Write the failing title test**

Create `src/lib/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sessionTitle } from './utils'

describe('sessionTitle', () => {
  it('returns Untitled for empty/whitespace', () => {
    expect(sessionTitle('   ')).toBe('Untitled')
  })
  it('collapses whitespace and keeps short titles', () => {
    expect(sessionTitle('  a  rainy   day ')).toBe('a rainy day')
  })
  it('truncates long titles with an ellipsis', () => {
    const out = sessionTitle('x'.repeat(60))
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out.endsWith('…')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm vitest run src/lib/utils.test.ts`
Expected: FAIL — `sessionTitle` not exported.

- [ ] **Step 3: Add `sessionTitle` + `Session` type**

In `src/lib/utils.ts`, append:

```ts
/** Derive a session title from a brief idea: whitespace-collapsed, ≤40 chars, "Untitled" if empty. */
export function sessionTitle(idea: string): string {
  const t = idea.trim().replace(/\s+/g, ' ')
  if (!t) return 'Untitled'
  return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t
}
```

In `src/lib/types.ts`, append (after `Clip`):

```ts
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
}
```

- [ ] **Step 4: Write the failing store tests**

Append to `src/store/useStore.test.ts`:

```ts
import type { Session } from '@/lib/types'

describe('sessions', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ sessions: [], activeSessionId: null, brief: { ...useStore.getState().brief, idea: '' } })
  })

  it('beginSession creates + persists + activates a session (idempotent while active)', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'rainy day' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId
    expect(id).toBeTruthy()
    const lib = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!) as Session[]
    expect(lib).toHaveLength(1)
    expect(lib[0].title).toBe('rainy day')
    expect(localStorage.getItem('seed-audio-studio:activeSession')).toBe(id)
    useStore.getState().beginSession() // no-op while active
    expect(useStore.getState().sessions).toHaveLength(1)
  })

  it('saveActiveSession snapshots brief/plan/category/clips into the active session', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'a' } })
    useStore.getState().beginSession()
    useStore.setState({ category: 'Podcast', clips: [{ id: 'c1', sceneId: 's1', title: 'S', kind: 'T2A', speakers: [], prompt: 'p', status: 'done', url: 'https://a' }] })
    useStore.getState().saveActiveSession()
    const lib = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!) as Session[]
    expect(lib[0].category).toBe('Podcast')
    expect(lib[0].clips[0].url).toBe('https://a')
  })

  it('loadSession restores brief/plan/clips and marks status done when clips exist', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'first' } })
    useStore.getState().beginSession()
    useStore.setState({ clips: [{ id: 'c1', sceneId: 's1', title: 'S', kind: 'T2A', speakers: [], prompt: 'p', status: 'done', url: 'https://a' }] })
    useStore.getState().saveActiveSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().newSession()
    expect(useStore.getState().clips).toHaveLength(0)
    useStore.getState().loadSession(id)
    expect(useStore.getState().brief.idea).toBe('first')
    expect(useStore.getState().clips).toHaveLength(1)
    expect(useStore.getState().status).toBe('done')
  })

  it('renameSession updates the title (Untitled on empty)', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'x' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().renameSession(id, '  ')
    expect(useStore.getState().sessions[0].title).toBe('Untitled')
    useStore.getState().renameSession(id, 'My run')
    expect(useStore.getState().sessions[0].title).toBe('My run')
  })

  it('deleteSession removes it; deleting the active one resets to a clean state', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'x' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().deleteSession(id)
    expect(useStore.getState().sessions).toHaveLength(0)
    expect(useStore.getState().activeSessionId).toBeNull()
    expect(useStore.getState().clips).toHaveLength(0)
    expect(localStorage.getItem('seed-audio-studio:activeSession')).toBeNull()
  })
})
```

- [ ] **Step 5: Run it to verify failure**

Run: `pnpm vitest run src/store/useStore.test.ts`
Expected: FAIL — session state/actions missing.

- [ ] **Step 6: Implement the store session layer**

In `src/store/useStore.ts`:

Update imports:

```ts
import { uid, sessionTitle } from '@/lib/utils'
import type { Brief, Clip, CharacterImage, Plan, Session, StudioStatus, Voice } from '@/lib/types'
```

Add keys next to the others:

```ts
const SESS_KEY = 'seed-audio-studio:sessions'
const ACTIVE_KEY = 'seed-audio-studio:activeSession'
```

Add load/save helpers next to `loadCharacterLibrary`:

```ts
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
```

Add to the `Store` interface (near `characterLibrary`):

```ts
  sessions: Session[]
  activeSessionId: string | null
```

and (near the other actions):

```ts
  beginSession: () => void
  saveActiveSession: () => void
  newSession: () => void
  loadSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
```

Initialize state (near `characterLibrary: loadCharacterLibrary()`):

```ts
  sessions: loadSessions(),
  activeSessionId: localStorage.getItem(ACTIVE_KEY),
```

Implement the actions (place after `clearLibrary`/`clearCharacterLibrary`, before `clearResults`):

```ts
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
        ? { ...x, brief: s.brief, plan: s.plan, category: s.category, clips: s.clips, updatedAt: Date.now() }
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
      status: sess.clips.length ? 'done' : 'idle',
      currentStep: null,
    })
  },

  renameSession: (id, title) =>
    set((s) => {
      const t = title.trim() || 'Untitled'
      const next = s.sessions.map((x) => (x.id === id ? { ...x, title: t, updatedAt: Date.now() } : x))
      saveSessions(next)
      return { sessions: next }
    }),

  deleteSession: (id) =>
    set((s) => {
      const next = s.sessions.filter((x) => x.id !== id)
      saveSessions(next)
      if (s.activeSessionId === id) {
        localStorage.removeItem(ACTIVE_KEY)
        return { sessions: next, activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, category: null, clips: [], status: 'idle', currentStep: null }
      }
      return { sessions: next }
    }),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/utils.test.ts src/store/useStore.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test:run`
Expected: 0 type errors; all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/utils.ts src/lib/utils.test.ts src/store/useStore.ts src/store/useStore.test.ts
git commit -m "feat(store): session type + persistence + CRUD actions"
```

---

### Task 2: Wire sessions into runStudio + regenScene

**Files:**
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.run-session.test.ts` (create)

**Interfaces:**
- Consumes: `beginSession`, `saveActiveSession` (Task 1).
- Produces: `runStudio` creates/updates + persists the active session across a run; `regenScene` persists after it settles.

- [ ] **Step 1: Write the failing integration test**

Create `src/store/useStore.run-session.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/studio/plan', () => ({
  makePlan: vi.fn(async () => ({
    category: 'Podcast',
    characters: [],
    scenes: [{ id: 's1', kind: 'T2A', title: 'Scene', speakers: [], prompt: 'p' }],
  })),
}))
vi.mock('@/services/studio/generate', () => ({
  generateFromPlan: vi.fn(async (_plan: unknown, _args: unknown, cb: { onScene?: (id: string, r: { url: string; durationSec: number }) => void }) => {
    cb.onScene?.('s1', { url: 'https://audio', durationSec: 5 })
  }),
  generateScene: vi.fn(),
}))

import { useStore } from './useStore'

beforeEach(() => {
  localStorage.clear()
  useStore.setState({
    key: 'id:hex',
    sessions: [],
    activeSessionId: null,
    clips: [],
    plan: null,
    brief: { ...useStore.getState().brief, idea: 'a rainy day', withVideo: false },
  })
})

describe('runStudio session persistence', () => {
  it('creates and persists a session titled from the brief with the generated clips', async () => {
    await useStore.getState().runStudio()
    const sessions = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('a rainy day')
    expect(sessions[0].category).toBe('Podcast')
    expect(sessions[0].clips.some((c: { url?: string }) => c.url === 'https://audio')).toBe(true)
  })

  it('reuses the active session instead of creating a second one on regenerate', async () => {
    await useStore.getState().runStudio()
    await useStore.getState().runStudio() // activeSessionId is now set → update in place
    const sessions = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!)
    expect(sessions).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm vitest run src/store/useStore.run-session.test.ts`
Expected: FAIL — no session persisted (wiring absent).

- [ ] **Step 3: Wire `runStudio`**

In `src/store/useStore.ts` `runStudio`, immediately AFTER the `if (!brief.idea.trim()) {...}` guard block and BEFORE `set({ status: 'planning', ... })`, add:

```ts
    get().beginSession()
```

After the existing `set({ plan, category: plan.category, clips, status: 'generating' })` line, add:

```ts
    get().saveActiveSession()
```

Inside the `generateFromPlan` callbacks, append `get().saveActiveSession()` to the end of the `onScene`, `onSceneVideo`, and `onLipSync` handlers, e.g.:

```ts
        onScene: (sceneId, r) => {
          patchClipByScene(sceneId, { status: 'done', url: r.url, durationSec: r.durationSec })
          get().saveActiveSession()
        },
        onSceneVideo: (sceneId, url) => {
          patchClipByScene(sceneId, { videoStatus: 'done', videoUrl: url })
          get().saveActiveSession()
        },
        onLipSync: (sceneId, url) => {
          patchClipByScene(sceneId, { lipsyncStatus: 'done', lipsyncUrl: url })
          get().saveActiveSession()
        },
```

Finally, replace the trailing `set({ status: 'done', currentStep: null })` with:

```ts
    set({ status: 'done', currentStep: null })
    get().saveActiveSession()
```

- [ ] **Step 4: Wire `regenScene`**

In `regenScene`, at the very end of the function (after the outer `try/catch` that ends with the `catch` setting `status: 'error'`), add a final line inside the method body:

```ts
    get().saveActiveSession()
```

(Place it as the last statement of `regenScene`, after the `catch` block closes, so it runs whether the regen succeeded or errored.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/store/useStore.run-session.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test:run`
Expected: 0 type errors; all pass.

- [ ] **Step 7: Commit**

```bash
git add src/store/useStore.ts src/store/useStore.run-session.test.ts
git commit -m "feat(store): persist active session across runStudio + regenScene"
```

---

### Task 3: SessionSidebar + Studio layout + expired-media note

**Files:**
- Create: `src/components/SessionSidebar.tsx`
- Modify: `src/screens/Studio.tsx`
- Modify: `src/components/ClipCard.tsx`

**Interfaces:**
- Consumes: store `sessions`, `activeSessionId`, `newSession`, `loadSession`, `renameSession`, `deleteSession`.
- Produces: UI only.

- [ ] **Step 1: Create the sidebar component**

Create `src/components/SessionSidebar.tsx`:

```tsx
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

export function SessionSidebar() {
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeSessionId)
  const newSession = useStore((s) => s.newSession)
  const loadSession = useStore((s) => s.loadSession)
  const renameSession = useStore((s) => s.renameSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <aside className="flex h-full flex-col gap-2 p-3">
      <button
        onClick={newSession}
        className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <Plus className="size-4" /> New
      </button>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
              s.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renameSession(s.id, draft)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameSession(s.id, draft)
                    setEditingId(null)
                  }
                }}
                className="w-full bg-transparent outline-none"
              />
            ) : (
              <>
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => loadSession(s.id)} title={s.title}>
                  {s.title}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    setEditingId(s.id)
                    setDraft(s.title)
                  }}
                  aria-label="Rename"
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    if (confirm(`Delete "${s.title}"?`)) deleteSession(s.id)
                  }}
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
```

NOTE on `confirm()`: this repo has no confirm dialogs elsewhere; `window.confirm` is acceptable for a destructive delete here (browser-native, no dependency). If the reviewer prefers a Radix dialog, that is a follow-up — keep `confirm` for v1.

- [ ] **Step 2: Verify the component typechecks**

Run: `pnpm typecheck`
Expected: PASS (0 errors). If `lucide-react` lacks `Pencil`/`Trash2`/`Plus`, substitute icons that ARE exported by the installed `lucide-react@1.17` (check `node_modules/lucide-react`); pick the closest available names and keep the same layout.

- [ ] **Step 3: Mount the sidebar in Studio**

In `src/screens/Studio.tsx`: import `SessionSidebar` and `useState` from react, add a `Menu` icon import from lucide-react (or an available icon), and wrap the page so the sidebar is the left column with a header toggle for narrow screens. Replace the outer structure:

```tsx
import { useState } from 'react'
import { AudioLines, Loader2, Menu } from 'lucide-react'
import { SessionSidebar } from '@/components/SessionSidebar'
// ...existing imports...

export function Studio() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // ...existing useStore selectors...

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-[1400px] px-5 py-3 flex items-center gap-2.5">
          <button className="lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sessions">
            <Menu className="size-5" />
          </button>
          <AudioLines className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Seed Audio Studio</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <div
          className={cn(
            'w-60 shrink-0 border-r border-border/60',
            sidebarOpen ? 'block' : 'hidden lg:block',
          )}
        >
          <SessionSidebar />
        </div>

        <main className="min-w-0 flex-1 px-5 py-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* existing left (inputs+library) and right (status+clips) columns unchanged */}
          ...
        </main>
      </div>
    </div>
  )
}
```

Keep the existing inputs/library and status/results column JSX exactly as it is today inside `<main>`. Import `cn` from `@/lib/utils` if not already imported.

- [ ] **Step 4: Expired-media note in ClipCard**

In `src/components/ClipCard.tsx`, add a local error flag and show a note when a media element fails to load (covers reopened sessions with dead fal URLs). Add near the top of the component:

```tsx
const [mediaError, setMediaError] = useState(false)
```

Add `onError={() => setMediaError(true)}` to the combined `<video>`, the fallback `<video>`, and the `<audio>` elements. Then render, next to the status line:

```tsx
{mediaError && (
  <p className="text-xs text-muted-foreground">media link expired — regenerate this clip</p>
)}
```

(Ensure `useState` is imported in ClipCard.)

- [ ] **Step 5: Typecheck + build + lint + full suite**

Run: `pnpm typecheck && pnpm build && pnpm lint && pnpm test:run`
Expected: 0 type errors; build succeeds; no NEW lint errors; all tests pass.

- [ ] **Step 6: Manual verification**

Run `pnpm dev`:
1. Generate a run → a session appears in the left sidebar titled from the brief.
2. "+ New" clears the form; generating again adds a second session.
3. Click an old session → its brief + clips restore.
4. Rename and delete work; deleting the active session resets to a clean state.
5. Refresh the page → sessions persist and the sidebar still lists them.

(No fal key is available in the implementer's environment for a full generate — note that the sidebar CRUD + persistence + restore can be verified by seeding a session via the app, and the generate-path was covered by Task 2's mocked test. Note this in the report.)

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionSidebar.tsx src/screens/Studio.tsx src/components/ClipCard.tsx
git commit -m "feat(ui): session sidebar, three-column layout, expired-media note"
```

---

## Self-Review Notes

- **Spec coverage:** Session type + storage keys (T1) ✓; lifecycle create-when-null / update-when-active / "+ New" resets (T1 `beginSession`/`newSession`, T2 wiring) ✓; store URLs only (no blobs — T1 snapshot is plain state) ✓; title ≤40/Untitled + newest-first (T1 `sessionTitle`, `beginSession` prepend) ✓; sidebar new/open/rename/delete + active highlight + collapsible (T3) ✓; expired-media note (T3 ClipCard) ✓; QuotaExceededError → toast (T1 `beginSession`/`saveActiveSession` catch) ✓; persistence across run + regen (T2) ✓; corrupt storage → [] (T1 `loadSessions`) ✓.
- **Type consistency:** `Session` fields, `activeSessionId: string | null`, and action names (`beginSession`/`saveActiveSession`/`newSession`/`loadSession`/`renameSession`/`deleteSession`) are used identically across T1/T2/T3.
- **Placeholder scan:** none — every code step is concrete. T3 Step 2/3 flag the lucide-react icon-availability check (the repo previously hit a missing `Github` export in `lucide-react@1.17`), instructing a concrete substitution rather than leaving it vague.
- **Risk:** `window.confirm` for delete is called out explicitly as an accepted v1 choice (no dialog dependency); a Radix dialog is a noted optional follow-up.
```
