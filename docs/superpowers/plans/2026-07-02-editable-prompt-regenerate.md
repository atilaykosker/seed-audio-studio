# Editable Prompt + Regenerate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a clip's prompt in the ClipCard and regenerate with the edited text sent to the model verbatim.

**Architecture:** A new store action `editClipPrompt(sceneId, text)` writes the edited text into the plan/bioPlan source of truth (scene/shot `visual`) and the clip's `prompt`, then persists. ClipCard's Prompt disclosure becomes an editable textarea; Regenerate commits the draft (only if changed) then calls the existing `regenScene`.

**Tech Stack:** TypeScript, React 19, Zustand, Vite, Vitest (jsdom), Tailwind v4 + Radix.

## Global Constraints

- Regenerate must send the edited text **verbatim** as the driving prompt (keyframe + video).
- **Biography:** edited text replaces the shot's `visual` (1:1). **Story:** edited text replaces the scene's `visual` AND clears `dialogue` (so the regenerated prompt is exactly the edited text; structured per-character voice-consistency is disabled for an edited story regen — accepted trade-off).
- A plain Regenerate with no edit must NOT mutate the plan — commit the draft only when it differs from `clip.prompt`.
- No type changes: `Clip.prompt` (exists) is the editable value; edit is written back to `Scene.visual`/`BioShot.visual`.
- No content-policy evasion — this is user-authored editing only.
- Path alias `@/` → `src/`. One test file: `pnpm vitest run <path>`; typecheck `pnpm typecheck`; full suite `pnpm test:run`; build `pnpm build`.

---

### Task 1: store — `editClipPrompt` action

**Files:**
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.editprompt.test.ts` (create)

**Interfaces:**
- Consumes: existing store state (`plan`, `bioPlan`, `clips`), `saveActiveSession`.
- Produces: `editClipPrompt: (sceneId: string, text: string) => void` on the store.

- [ ] **Step 1: Write the failing test**

Create `src/store/useStore.editprompt.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './useStore'
import type { BiographyPlan, Clip, Plan } from '@/lib/types'

beforeEach(() => {
  useStore.setState({ plan: null, bioPlan: null, clips: [], activeSessionId: null })
})

describe('editClipPrompt', () => {
  it('story: sets scene.visual to the text, clears dialogue, and updates clip.prompt', () => {
    const plan: Plan = {
      category: 'Cartoon',
      characters: [],
      scenes: [{ id: 'sc1', title: 'S', speakers: [], visual: 'old visual', dialogue: 'A: "hi"' }],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sc1', title: 'S', speakers: [], prompt: 'old visual\nA: "hi"', status: 'done' },
    ]
    useStore.setState({ plan, clips })
    useStore.getState().editClipPrompt('sc1', 'a calm empty meadow, wide shot')
    const s = useStore.getState()
    expect(s.plan!.scenes[0].visual).toBe('a calm empty meadow, wide shot')
    expect(s.plan!.scenes[0].dialogue).toBe('')
    expect(s.clips[0].prompt).toBe('a calm empty meadow, wide shot')
  })

  it('biography: sets the matching shot.visual to the text and updates clip.prompt', () => {
    const bioPlan: BiographyPlan = {
      subject: 'Ada',
      style: 'painterly',
      stages: [{ id: 'st1', label: 'adult', appearance: 'a' }],
      pages: [{ id: 'p1', index: 1, narration: 'n', shots: [{ id: 'sh1', stageId: 'st1', visual: 'old shot' }] }],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sh1', title: 'Page 1 · Shot 1', speakers: [], prompt: 'old shot', status: 'done' },
    ]
    useStore.setState({ bioPlan, clips })
    useStore.getState().editClipPrompt('sh1', 'a bright study, candlelight, close-up')
    const s = useStore.getState()
    expect(s.bioPlan!.pages[0].shots[0].visual).toBe('a bright study, candlelight, close-up')
    expect(s.clips[0].prompt).toBe('a bright study, candlelight, close-up')
  })

  it('only touches the targeted clip/scene', () => {
    const plan: Plan = {
      category: 'C',
      characters: [],
      scenes: [
        { id: 'sc1', title: 'A', speakers: [], visual: 'v1', dialogue: 'd1' },
        { id: 'sc2', title: 'B', speakers: [], visual: 'v2', dialogue: 'd2' },
      ],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sc1', title: 'A', speakers: [], prompt: 'v1', status: 'done' },
      { id: 'c2', sceneId: 'sc2', title: 'B', speakers: [], prompt: 'v2', status: 'done' },
    ]
    useStore.setState({ plan, clips })
    useStore.getState().editClipPrompt('sc1', 'edited')
    const s = useStore.getState()
    expect(s.plan!.scenes[1].visual).toBe('v2')
    expect(s.plan!.scenes[1].dialogue).toBe('d2')
    expect(s.clips[1].prompt).toBe('v2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/store/useStore.editprompt.test.ts`
Expected: FAIL — `editClipPrompt` is not a function on the store.

- [ ] **Step 3: Add `editClipPrompt` to the store interface**

In `src/store/useStore.ts`, in the `interface Store { ... }` block, add this line right after `setBrief: (patch: Partial<Brief>) => void`:

```ts
  editClipPrompt: (sceneId: string, text: string) => void
```

- [ ] **Step 4: Implement the action**

In `src/store/useStore.ts`, add the action to the store object. Place it right after the `setBrief:` implementation (the line `setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),`):

```ts
  editClipPrompt: (sceneId, text) => {
    set((s) => {
      const clips = s.clips.map((c) => (c.sceneId === sceneId ? { ...c, prompt: text } : c))
      if (s.bioPlan) {
        const bioPlan = {
          ...s.bioPlan,
          pages: s.bioPlan.pages.map((pg) => ({
            ...pg,
            shots: pg.shots.map((sh) => (sh.id === sceneId ? { ...sh, visual: text } : sh)),
          })),
        }
        return { clips, bioPlan }
      }
      if (s.plan) {
        const plan = {
          ...s.plan,
          scenes: s.plan.scenes.map((sc) => (sc.id === sceneId ? { ...sc, visual: text, dialogue: '' } : sc)),
        }
        return { clips, plan }
      }
      return { clips }
    })
    get().saveActiveSession()
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/store/useStore.editprompt.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add src/store/useStore.ts src/store/useStore.editprompt.test.ts
git commit -m "feat(store): editClipPrompt writes edited prompt into plan/bioPlan + clip"
```

---

### Task 2: UI — editable prompt textarea + regenerate commits the edit

**Files:**
- Modify: `src/components/ClipCard.tsx`

**Interfaces:**
- Consumes: store `regenScene`, `editClipPrompt` (Task 1); `Textarea` from `@/components/ui`.

- [ ] **Step 1: Rewrite `ClipCard.tsx`**

Replace the full contents of `src/components/ClipCard.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { Download, RefreshCw, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { Button, Card, CardContent, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Clip } from '@/lib/types'

export function ClipCard({ clip }: { clip: Clip }) {
  const regen = useStore((s) => s.regenScene)
  const editClipPrompt = useStore((s) => s.editClipPrompt)
  const [showPrompt, setShowPrompt] = useState(false)
  const [draft, setDraft] = useState(clip.prompt)
  const [mediaError, setMediaError] = useState(false)
  useEffect(() => setMediaError(false), [clip.videoUrl])
  // Keep the editable draft in sync when the clip's prompt changes (regen, session load).
  useEffect(() => setDraft(clip.prompt), [clip.prompt])
  const busy = clip.status === 'running'

  const regenerate = () => {
    if (draft !== clip.prompt) editClipPrompt(clip.sceneId, draft)
    regen(clip.sceneId)
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-medium truncate">{clip.title}</span>
            {clip.speakers.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{clip.speakers.join(' · ')}</div>
            )}
          </div>
        </div>

        {clip.status === 'done' && clip.videoUrl && (
          <video
            src={clip.videoUrl}
            controls
            playsInline
            preload="none"
            poster={clip.imageUrl}
            className="w-full rounded-md border border-border/60"
            onError={() => setMediaError(true)}
          />
        )}
        {mediaError && <p className="text-xs text-muted-foreground">media link expired — regenerate this clip</p>}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {clip.phase === 'queued' ? 'Queued…' : 'Generating…'}
          </div>
        )}
        {clip.status === 'pending' && <div className="text-sm text-muted-foreground">Waiting…</div>}
        {clip.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{clip.error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt((v) => !v)}>
            <ChevronDown className={`size-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} /> Prompt
          </Button>
          {clip.videoUrl && (
            <a href={clip.videoUrl} download={`${clip.title.replace(/\s+/g, '_')}.mp4`}>
              <Button variant="ghost" size="sm">
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={regenerate}>
            <RefreshCw className="size-4" /> Regenerate
          </Button>
        </div>

        {showPrompt && (
          <div className="space-y-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="text-xs"
              placeholder="Edit the prompt, then Regenerate…"
            />
            <p className="text-[11px] text-muted-foreground">Edit and hit Regenerate — the text is sent to the model as-is.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify typecheck + lint on the file**

Run: `pnpm typecheck 2>&1 | grep 'ClipCard.tsx'`
Expected: NO output.
Run: `pnpm lint 2>&1 | grep 'ClipCard'`
Expected: no new errors (no unused imports — `Textarea` is used).

- [ ] **Step 3: Commit**

```bash
git add src/components/ClipCard.tsx
git commit -m "feat(ui): editable prompt textarea; Regenerate commits the edit"
```

---

### Task 3: Verification — typecheck, lint, full suite, build

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 3: Full test suite**

Run: `pnpm test:run`
Expected: all pass, including the new `useStore.editprompt.test.ts` (3 cases) and the untouched suite.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: `tsc -b` + `vite build` succeed, `dist/` emitted.

- [ ] **Step 5: Manual smoke (note only — no key in CI)**

Manual user step: `pnpm dev`, generate any clip, open its **Prompt**, edit the text, hit **Regenerate**, confirm the new clip reflects the edited prompt; confirm a plain Regenerate (no edit) behaves as before. Report this remains pending a real key.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify editable-prompt regenerate green" --allow-empty
```

---

## Notes for the implementer

- **The `draft !== clip.prompt` guard is load-bearing:** without it, a plain Regenerate on a story clip would fold the composed `visual\ndialogue` back into `visual` and clear `dialogue`, silently mutating the plan. Only commit when the user actually changed the text.
- **Biography vs story branch** keys on `bioPlan` presence (a biography run sets `plan: null`, a story run sets `bioPlan: null`), matching `regenScene`.
- No new fields on `Clip` — `prompt` already exists and is the single editable value.
