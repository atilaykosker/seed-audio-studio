# Backend Migration — Plan 5: Full Next.js Cutover (Delete Vite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Studio UI into the Next.js App Router, rewire the zustand store from client-side fal (`fal.subscribe` streaming) to the server API via the `src/lib/api.ts` SDK (submit-then-poll), replace the BYOK `KeyBubble` with the password login + a logout control, then **delete Vite entirely** and collapse the dual-build scaffolding. End state: one Next app on Cloudflare Workers, no Vite, everything same-origin.

**Architecture:** The existing `src/components/**` + `src/screens/Studio.tsx` are reused as **client components** rendered by `app/page.tsx` (middleware already redirects unauthenticated users to `/login`). The store keeps its state shape and UI-facing action names, but `runStudio`/`regenScene` become client orchestration loops: `createPlan` → mint characters (`generateCharacter`/`generateStage` + poll `characterStatus`) → per-scene `generateScene` + poll `clipStatus`, mapping onto the same `patchClipByScene` transitions. Session/character CRUD + boot hydration move from `localStorage` to the SDK. Shared modules that the SERVER imports (`src/services/studio/{plan,image,video,guide}.ts`, `src/services/fal/client.ts` catalogs + `buildVideoInput`, `src/services/fal/errors.ts`) STAY; only client-BYOK and client-orchestration surfaces are removed.

**Tech Stack:** Next 15 App Router (client components), Tailwind v4 (`@tailwindcss/postcss`), `next/font/google`, the `src/lib/api.ts` SDK, Vitest (config relocated out of `vite.config.ts`).

## Global Constraints

- After this plan there is NO Vite: `vite.config.ts`, `index.html`, `src/main.tsx`, `tsconfig.app.json`, `tsconfig.node.json` are deleted; `package.json` `dev`/`build`/`start` map to Next; Vite/HMR deps removed. A single root `tsconfig.json` covers `app/**`, `middleware.ts`, and `src/**`.
- Do NOT delete modules the SERVER imports: `src/services/studio/{plan,image,video,guide}.ts`, `src/services/fal/client.ts`, `src/services/fal/errors.ts`, all of `src/server/**`, `src/lib/{types,cost,api,storage}.ts`. (The server pipeline reuses the prompt builders, `makePlan`/`makeBioPlan`, `buildVideoInput`, `getVideoModel`, the model catalogs, and `mapFalError`.)
- Delete only fully-dead client-BYOK code: `src/services/fal/keyStore.ts`, `src/components/KeyBubble.tsx`, `src/main.tsx`, and the store's `key`/`keyDialogOpen`/`setKey`/`setKeyDialogOpen`/`beginSession`/`saveActiveSession` + the `runStudio` `if(!key)` guard. Leave `src/services/studio/generate.ts`'s now-unused orchestrators in place (harmless; a follow-up cleanup can remove them) UNLESS a task says otherwise.
- All ported UI files that use hooks/state/events/zustand get `'use client'` (every file in `src/components/**` + `src/screens/Studio.tsx`). No `import.meta` (Vite-only) — replace `import.meta.env.DEV` with `process.env.NODE_ENV !== 'production'`.
- The store's boot hydration must NOT touch `localStorage` at module top-level (breaks SSR/RSC). Move it into a `'use client'` init effect calling the SDK.
- `src/lib/api.ts` uses relative `/api` + `credentials:'include'` — same-origin now, so cookies flow. Non-2xx → `ApiError`; UI error copy should read `e.friendly?.title ?? e.message` (validation routes send a bare-string error).
- Every task green: its vitest passes AND (once config is collapsed) `pnpm typecheck` + `pnpm build` + `pnpm next:build` exit 0. Until Task 7 collapses the config, use the existing split commands; each task states which.
- Reuse `src/lib/api.ts` for ALL server calls — the store never calls `fetch` or the client-fal services directly.

## Ordering note
Tasks 1–6 keep Vite installed (so the app still builds both ways and each task is verifiable) and do the port + rewire. Task 7 is the single destructive "delete Vite + collapse config" step, done last so a break is easy to localize. Task 8 is the full-app live smoke.

---

## File Structure (net changes)

- Move: `src/index.css` → merged into `app/globals.css`; fonts → `app/layout.tsx` (`next/font/google`).
- `app/page.tsx` → `'use client'`, renders `<Studio/>` + `<Toaster/>` (+ a logout control), replacing the placeholder.
- Add `'use client'` to `src/components/*.tsx` + `src/screens/Studio.tsx`.
- Rewrite: `src/store/useStore.ts` (SDK-based), `src/store/*.test.ts` (SDK-mocked).
- New server route: `app/api/clips/[id]/route.ts` (`PATCH` prompt + plan writeback) for `editClipPrompt`.
- Add to SDK: `editClipPrompt(clipId, text)` in `src/lib/api.ts`.
- Replace: `src/components/KeyBubble.tsx` → deleted; a `LogoutButton` (small) in the header/settings. `SettingsDialog.tsx` loses key fields.
- Delete (Task 7): `vite.config.ts`, `index.html`, `src/main.tsx`, `tsconfig.app.json`, `tsconfig.node.json`, `src/services/fal/keyStore.ts`; add `vitest.config.ts`.

---

### Task 1: CSS, fonts, and layout → Next

**Files:**
- Modify: `app/globals.css` (replace its one line with the full design system), `app/layout.tsx` (fonts + metadata)
- Test: none (visual; verified by `pnpm next:build` + Task 8 smoke)

- [ ] **Step 1: Move `src/index.css` into `app/globals.css`**
Copy the ENTIRE contents of `src/index.css` (Tailwind import, `@custom-variant`, `@theme inline`, `:root`, `.dark`, `@layer base`, `@layer components`) into `app/globals.css`, with two edits:
  - In `@layer base`, change the `html, body, #root { height: 100% }` rule: drop `#root` (Next has none) → `html, body { height: 100% }`.
  - In `@theme inline`, keep `--font-sans`/`--font-display` but point them at the `next/font` CSS variables (Step 2): `--font-sans: var(--font-inter), 'Inter', ...` and `--font-display: var(--font-space-grotesk), 'Space Grotesk', ...`.
Keep `@import 'tailwindcss'` and `@import 'tw-animate-css'` at the top (both stay; `tw-animate-css` is a devDep).

- [ ] **Step 2: Load fonts + metadata in `app/layout.tsx`**
Use `next/font/google`:
```tsx
import './globals.css'
import type { ReactNode } from 'react'
import { Inter, Space_Grotesk } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' })

export const metadata = {
  title: 'Bookticle Studio — AI Video',
  description: 'Turn a one-line brief into multi-shot AI video.',
  themeColor: '#faf9fc',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```
> If `themeColor` in `metadata` triggers a Next 15 warning (it moved to `viewport` export), move it to `export const viewport = { themeColor: '#faf9fc' }`.

- [ ] **Step 3: Ensure Tailwind v4 scans `src/**`**
Tailwind v4 auto-detects sources, but confirm the utility classes used in `src/components` (`btn-gradient`, `card-fancy`, `shimmer`, `chip`, `text-gradient`, `font-display`) survive in the build. If any are purged, add an explicit `@source "../src";` line to `app/globals.css` (Tailwind v4 `@source` directive) so `src/**` is scanned.

- [ ] **Step 4: Verify + commit**
Run: `pnpm next:build` (0; page still the placeholder for now). `pnpm build` (Vite) still 0.
```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(next): port design-system CSS + fonts into the Next layout"
```

---

### Task 2: `'use client'` directives on the UI tree

**Files:**
- Modify: every `.tsx` in `src/components/` + `src/screens/Studio.tsx` — add `'use client'` as the first line.
- Test: none (verified by next:build once the page renders Studio in Task 5; here just confirm no build regression)

- [ ] **Step 1:** Add `'use client'` as the FIRST line of each: `src/components/ui.tsx`, `BriefForm.tsx`, `VideoModelPicker.tsx`, `CharacterLibraryPanel.tsx`, `ClipCard.tsx`, `SessionSidebar.tsx`, `Toaster.tsx`, `SettingsDialog.tsx`, and `src/screens/Studio.tsx`. (Skip `KeyBubble.tsx` — it's deleted in Task 5.)
- [ ] **Step 2:** In any file using `import.meta` — there is exactly one, `src/App.tsx:19` (`import.meta.env.DEV`) — but `App.tsx` is replaced in Task 5, so no change here. Confirm via `git grep -n "import.meta" src/components src/screens src/store` → nothing.
- [ ] **Step 3: Verify + commit**
Run: `pnpm build` (Vite still 0) and `pnpm next:build` (0). Adding `'use client'` is inert for Vite and required for Next.
```bash
git add src/components src/screens
git commit -m "feat(next): mark Studio component tree as client components"
```

---

### Task 3: Store rewire — session/character CRUD + hydration via SDK

**Files:**
- Modify: `src/store/useStore.ts` (the CRUD + hydration + BYOK removal), `src/store/useStore.test.ts` (+ the other store tests) to the SDK model
- Test: `src/store/*.test.ts`

**Interfaces / behavior changes:**
- Remove state `key`, `keyDialogOpen` and actions `setKey`, `setKeyDialogOpen`, `beginSession`, `saveActiveSession`. Remove all `localStorage` session/character reads/writes and the top-level hydration block.
- Keep `model`/`videoModel` as client prefs — persist to `localStorage` inside a `typeof window !== 'undefined'` guard (client-only), read lazily in an init effect (not at module top-level).
- Add an async `hydrate()` action: `const [sessions, characterLibrary] = await Promise.all([api.listSessions(), api.listCharacters()])` → set them (sessions as summaries; the sidebar shows summaries, full session loads on demand). Called once from the page's init effect.
- `loadSession(id)`: `const s = await api.getSession(id)`; if s, set `plan`/`bioPlan`/`category`/`clips`/`brief`/`videoModel`/`activeSessionId` from it; `status: s.clips.length ? 'done' : 'idle'`.
- `renameSession(id, title)`: `await api.renameSession(id, title)` then update the in-memory summary list.
- `deleteSession(id)`: `await api.deleteSession(id)` then drop from list; if active, `clearResults()` + `activeSessionId=null`.
- `removeCharacterImage(id)`: `await api.deleteCharacter(id)` then drop from `characterLibrary`. `addCharacterImage` stays (updates the in-memory list as characters finish minting). `clearCharacterLibrary`: delete each via the SDK (or a note that bulk-clear is out of scope) — keep it deleting each `id` via `api.deleteCharacter`.
- Errors from any SDK call → `toast({ kind:'error', title, message: e.friendly?.title ?? e.message })` (use the `ApiError` shape).

- [ ] **Step 1: Rewrite the store tests first (TDD-ish)** — update `src/store/useStore.test.ts` (+ `useStore.run-session.test.ts`, `useStore.editprompt.test.ts`) to mock `src/lib/api.ts` (`vi.mock('@/lib/api')`) and assert the new behavior: `hydrate()` populates sessions/characterLibrary from the SDK; `loadSession` calls `api.getSession` and sets state; `deleteSession` calls `api.deleteSession`; removed actions (`setKey` etc.) no longer exist. Delete assertions tied to `localStorage`/`key`/`beginSession`/`saveActiveSession`.
- [ ] **Step 2: Run → RED** (`pnpm vitest run src/store` — old store still has localStorage/key logic + calls client-fal).
- [ ] **Step 3: Rewrite `useStore.ts`** for the CRUD + hydration + BYOK removal per the Interfaces above. Import `* as api from '@/lib/api'`. Leave `runStudio`/`regenScene` for Task 4 (temporarily they can still call the old services — but since Task 4 immediately follows, you may stub them to `throw new Error('rewired in Task 4')` if that keeps this task's tests green; prefer leaving them until Task 4 and only ensuring the CRUD tests pass).
- [ ] **Step 4: Run → GREEN** (the CRUD/hydration store tests pass).
- [ ] **Step 5: Verify + commit**
Run: `pnpm vitest run src/store && pnpm build && pnpm next:build` (all 0).
```bash
git add src/store/useStore.ts src/store/*.test.ts
git commit -m "feat(store): session/character CRUD + hydration via the API SDK"
```

---

### Task 4: Store rewire — `runStudio` + `regenScene` via SDK polling

**Files:**
- Modify: `src/store/useStore.ts` (`runStudio`, `regenScene`, add a `pollUntil` helper), `src/store/useStore.run-session.test.ts`
- Test: `src/store/useStore.run-session.test.ts`

**Behavior (the core rewrite):**
- Add a private `pollUntil<T>(fn: () => Promise<T>, done: (v: T) => boolean, { intervalMs = 4000, timeoutMs = 720000 })` helper (polls until `done` or timeout; throws on timeout).
- `runStudio()`:
  1. Guard non-empty `brief.idea` (drop the `if(!key)` guard).
  2. `set({ status:'planning', currentStep: brief.type==='biography' ? 'Planning biography…' : 'Planning shots…', plan:null, bioPlan:null, clips:[] })`.
  3. `const res = await api.createPlan(brief, { model, videoModel })` (try/catch → `set({status:'error'})` + error toast, return). Set `sessionId`(→`activeSessionId`), `plan`/`bioPlan`, `category`, `clips` (from `res.clips`), `status:'generating'`. Refresh the sidebar (`hydrate()` or unshift a summary).
  4. **Mint characters** (story: `res.plan.characters`; biography: for each stage, `generateStage`): skip names already in `characterLibrary` (reuse). For each: `const { characterId } = await api.generateCharacter(ch)` (or `generateStage`); `set currentStep` "Creating <name>…"; `await pollUntil(() => api.characterStatus(characterId), s => s.status==='done' || s.status==='error')`; on done → `addCharacterImage({ id: characterId, name: ch.name, url: s.url!, source:'minted', createdAt: Date.now() })`; on error → error toast (continue).
  5. **Generate scenes** in `clips` order: for each clip, `patchClipByScene(clip.sceneId, { status:'running' })`, `set currentStep` "Generating <title>…"; `await api.generateScene(sessionId, clip.sceneId)`; `await pollUntil(() => api.clipStatus(clip.id), s => s.status==='done'||s.status==='error')` — INSIDE the poll's each-tick, map the interim `{phase, status}` onto `patchClipByScene(clip.sceneId, { phase })`; on done → `patchClipByScene(clip.sceneId, { status:'done', videoUrl: s.videoUrl })`; on error → `patchClipByScene(clip.sceneId, { status:'error', error: s.error?.title ?? 'Generation failed' })`.
  6. `set({ status:'done', currentStep:null })`.
- `regenScene(sceneId)`: find the clip by `sceneId` in `clips`; `patchClipByScene(sceneId, { status:'running', error:undefined, videoUrl:undefined, imageUrl:undefined, phase:undefined })`; `await api.generateScene(activeSessionId!, sceneId)`; poll `clipStatus(clip.id)` → same mapping; `saveActiveSession` is gone (server persists).

> Note: the server's `/api/generate/scene` needs the CHARACTERS already minted (it resolves present speaker images from the library). Minting happens in step 4 before scene generation — preserving the original `generateFromPlan` "mint then render" order.

- [ ] **Step 1: Rewrite `useStore.run-session.test.ts`** to mock `@/lib/api` and assert: `runStudio` calls `createPlan`, sets `plan`/`clips`, mints each character via `generateCharacter` + polls `characterStatus`, then calls `generateScene` per clip + polls `clipStatus`, and maps a `done` poll to `clip.status='done'`+`videoUrl`. Use a fake `api` whose `characterStatus`/`clipStatus` return `running` once then `done` (to exercise the poll loop). Keep the poll interval tiny in tests (inject or mock a short interval).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** `runStudio`/`regenScene`/`pollUntil` per the behavior above.
- [ ] **Step 4: GREEN.**
- [ ] **Step 5: Verify + commit**
Run: `pnpm vitest run src/store && pnpm build && pnpm next:build` (all 0).
```bash
git add src/store/useStore.ts src/store/useStore.run-session.test.ts
git commit -m "feat(store): runStudio/regenScene via API SDK (submit + poll)"
```

---

### Task 5: `editClipPrompt` persistence — server route + SDK + store

**Files:**
- Create: `app/api/clips/[id]/route.ts` (`PATCH`)
- Modify: `src/server/db/clips.ts` (add `getClip` is present; add nothing if `updateClipStatus` covers prompt — else add a `updateClipPrompt`), `src/server/db/sessions.ts` (a helper to patch the session's plan/bioPlan for the scene), `src/lib/api.ts` (add `editClipPrompt`), `src/store/useStore.ts` (`editClipPrompt` → SDK)
- Test: `src/server/db/clips.test.ts` (if a new repo fn is added), `src/lib/api.test.ts`, `src/store/useStore.editprompt.test.ts`

**Behavior:** `editClipPrompt` currently mutates the clip's `prompt` AND the source plan (`scene.visual`/`shot.visual`, clearing `scene.dialogue`) so regen uses the edited text. Server-side, the scene text lives in the session's `plan`/`bio_plan` jsonb, which `/api/generate/scene` reads. So the PATCH must update BOTH the clip row `prompt` and the session's plan.
- `PATCH /api/clips/[id]` body `{ text }`: load the clip (`getClip`) → its `session_id`; `updateClipStatus(db, id, { /* prompt */ })` (extend `ClipPatch` with `prompt?` + include it in the dynamic SET); load the session row, patch its `plan`/`bio_plan` (find scene/shot by the clip's `scene_id`, set `.visual = text`, clear story `.dialogue`), write it back (`updateSessionPlan(db, sessionId, plan, bioPlan)` — a new repo fn). Return `{ ok: true }`.
- SDK `editClipPrompt(clipId: string, text: string): Promise<void>` → `PATCH /api/clips/${clipId}` `{ text }`.
- Store `editClipPrompt(clip, text)` → optimistic local update (as today) + `await api.editClipPrompt(clip.id, text)`.

- [ ] **Step 1:** Add `prompt?: string` to `ClipPatch` and include it in `updateClipStatus`'s dynamic SET (real-SQL test: patch prompt, re-read reflects it). Add `updateSessionPlan(db, id, plan, bioPlan)` to sessions repo (real-SQL test: write plan, `getSessionRow` reflects it). Add `getClip` if missing (present from Plan 3).
- [ ] **Step 2:** Write `app/api/clips/[id]/route.ts` `PATCH` per the behavior. Add `editClipPrompt` to `src/lib/api.ts` (+ a mocked-fetch test).
- [ ] **Step 3:** Rewire the store's `editClipPrompt` to call `api.editClipPrompt` after the optimistic local mutation; update `useStore.editprompt.test.ts` to mock the SDK.
- [ ] **Step 4: Verify + commit**
Run: `pnpm vitest run src/server/db src/lib/api.test.ts src/store && pnpm build && pnpm next:build` (all 0).
```bash
git add app/api/clips src/server/db/clips.ts src/server/db/clips.test.ts src/server/db/sessions.ts src/server/db/sessions.test.ts src/lib/api.ts src/lib/api.test.ts src/store/useStore.ts src/store/useStore.editprompt.test.ts
git commit -m "feat: editClipPrompt persists via PATCH /api/clips/[id]"
```

---

### Task 6: `app/page.tsx` renders Studio; login/logout; drop BYOK UI

**Files:**
- Modify: `app/page.tsx` (render Studio), `src/screens/Studio.tsx` (header copy + logout control), `src/components/SettingsDialog.tsx` (remove key fields)
- Delete: `src/components/KeyBubble.tsx`, `src/services/fal/keyStore.ts`
- Test: none new (verified by next:build + Task 8 smoke)

- [ ] **Step 1:** Replace `app/page.tsx` with a `'use client'` component that mounts the Studio and triggers hydration:
```tsx
'use client'
import { useEffect } from 'react'
import Studio from '@/screens/Studio'
import { Toaster } from '@/components/Toaster'
import { useStore } from '@/store/useStore'

export default function Home() {
  const hydrate = useStore((s) => s.hydrate)
  useEffect(() => { void hydrate() }, [hydrate])
  return (<><Studio /><Toaster /></>)
}
```
(Match the real export styles of `Studio`/`Toaster`/`useStore` — default vs named.)
- [ ] **Step 2:** In `Studio.tsx`: update header copy ("Bring your own key" pill → e.g. a small account/logout control), remove the `KeyBubble` render. Add a `LogoutButton` (inline or a tiny component) that calls `api.logout()` then `location.href = '/login'`.
- [ ] **Step 3:** In `SettingsDialog.tsx`: remove the "Forget API key" action + any key field; keep the planning-`model` picker (`MODELS`/`setModel`), Clear results, Clear character library (now via SDK). Remove imports from `keyStore`.
- [ ] **Step 4:** Delete `src/components/KeyBubble.tsx` and `src/services/fal/keyStore.ts`. `git grep -n "KeyBubble\|keyStore\|getStoredKey\|storeKey\|validateKey\|looksLikeKey\|clearKey" src app` → only stale references remain? Fix/remove them (App.tsx is deleted in Task 7; if it still imports keyStore, that's fine until Task 7 removes App.tsx — but App.tsx isn't used by Next, so it won't break next:build; confirm).
- [ ] **Step 5: Verify + commit**
Run: `pnpm next:build` (0 — the page now renders the full Studio; all components compile as client). Note: `pnpm build` (Vite) may now fail if `App.tsx` still imports the deleted `keyStore` — since Vite is deleted next task, that's acceptable, BUT to keep this task green under Vite too, either also delete `src/App.tsx` now or stub its keyStore import. Simplest: delete `src/App.tsx` + `src/main.tsx` here too (they're Vite-only entrypoints, unused by Next). If you delete them now, `pnpm build` (Vite) will fail (no entry) — so in THIS task, verify with `pnpm next:build` + `pnpm vitest run` only, and do the Vite-build removal in Task 7.
```bash
git add app/page.tsx src/screens/Studio.tsx src/components/SettingsDialog.tsx
git rm src/components/KeyBubble.tsx src/services/fal/keyStore.ts
git commit -m "feat(next): render Studio from app/page; password login + logout; remove BYOK UI"
```

---

### Task 7: Delete Vite + collapse config

**Files:**
- Create: `vitest.config.ts` (relocated Vitest config)
- Delete: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `tsconfig.app.json`, `tsconfig.node.json`
- Modify: `package.json` (scripts + deps), root `tsconfig.json` (single config covering `src/**`)

- [ ] **Step 1: Relocate Vitest config** — create `vitest.config.ts` carrying over the current `test` block from `vite.config.ts` (jsdom env, globals, `setupFiles: ['./src/server/db/test-setup.ts']`, the `@` alias `@ → src`). Use `defineConfig` from `vitest/config`. Run `pnpm vitest run` to confirm the full suite still resolves + passes with the new config file (before deleting vite.config.ts).
- [ ] **Step 2: Delete Vite files** — `git rm vite.config.ts index.html src/main.tsx src/App.tsx tsconfig.app.json tsconfig.node.json`.
- [ ] **Step 3: Collapse `tsconfig.json`** — it becomes the single project config: keep the Next compilerOptions (jsx preserve, the `next` plugin, `noEmit`), set `paths: { "@/*": ["./src/*"] }` (now unambiguous — no more Vite alias split; but app/ files import `@/src/...`? NO — app/ route handlers import `@/src/server/...`. With `@/*`→`src/*`, `@/src/server/x` → `src/src/server/x` ✗. So KEEP `"@/*": ["./*", "./src/*"]` so BOTH `@/src/...` (app routes) and `@/components/...` (UI) resolve. Document this.) Set `include: ["next-env.d.ts", "worker-configuration.d.ts", "app/**/*", "middleware.ts", "src/**/*", ".next/types/**/*.ts"]` (now all of src). Remove references to the deleted tsconfigs.
- [ ] **Step 4: Fix `package.json`** — scripts: `dev: next dev`, `build: next build`, `start: next start` (drop the vite `dev`/`build`/`preview`, drop the `next:*` duplicates or keep as aliases); `typecheck: tsc -p tsconfig.json --noEmit`; keep `test`/`test:run`/`lint`/`cf:*`. Remove deps: `@tailwindcss/vite` (dependency), devDeps `vite`, `@vitejs/plugin-react`, `eslint-plugin-react-refresh` (and drop its use from `eslint.config.js`). Keep `vitest`/`@vitest/ui`/`jsdom`/`tw-animate-css`/`@tailwindcss/postcss`/`postcss`. Run `pnpm install` to prune the lockfile.
- [ ] **Step 5: Full verification**
Run: `pnpm typecheck` (0), `pnpm vitest run` (full suite green), `pnpm lint` (0 errors), `pnpm next:build` (0), `pnpm cf:build` (0 — the Worker bundle still builds). There is no more `pnpm build`(Vite) — confirm `dev`/`build`/`start` are Next.
- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "chore: delete Vite; single Next tsconfig + vitest.config; prune deps/scripts"
```

---

### Task 8 *(full-app live smoke)*: the whole app on Next

**Files:** none (verification).

- [ ] **Step 1:** `wrangler d1 migrations apply bookticle-studio-db --local` then `pnpm cf:preview` (:8787). Open in a browser (or drive via the Chrome tools).
- [ ] **Step 2:** Verify end-to-end through the UI: `/` redirects to `/login`; log in (`devpass123`); the Studio renders (styled — gradients/fonts/cards intact); enter a short story brief → Generate; watch a character mint then a scene render to a playable video; the session appears in the sidebar; reload → the session rehydrates from the server; rename/delete a session; a character shows in the library; edit a clip prompt → Regenerate uses it; logout → back to `/login`.
- [ ] **Step 3:** Record observed results in the report. (Human/controller step with real fal + S3.)

---

## Self-Review

**Spec coverage (Plan 5 / the cutover):**
- Studio UI ported to Next (client components) → Tasks 1-2, 6. ✅
- Store rewired to the SDK (CRUD + hydration + runStudio/regenScene poll) → Tasks 3-4. ✅
- `editClipPrompt` persistence → Task 5. ✅
- BYOK `KeyBubble` → password login + logout → Task 6. ✅
- Vite deleted + config collapsed → Task 7. ✅
- Full-app verification → Task 8. ✅
- Shared server-imported modules preserved (not deleted) → Global Constraints + Task 6/7 delete-lists exclude them. ✅

**Placeholder scan:** no TBD; the one `@source`/`viewport` conditionals are explicit "do X if the build warns" fallbacks, not vagueness. Task 8 is a real checklist.

**Type/name consistency:** the store keeps its public action names (`runStudio`/`regenScene`/`loadSession`/`renameSession`/`deleteSession`/`addCharacterImage`/`removeCharacterImage`/`editClipPrompt`/`setBrief`/`setModel`/`setVideoModel`/`toast`) so `src/components/**` keep compiling; removed actions (`setKey`/`setKeyDialogOpen`/`beginSession`/`saveActiveSession`) are only referenced by deleted BYOK files. The SDK functions (`createPlan`/`generateCharacter`/`generateStage`/`characterStatus`/`generateScene`/`clipStatus`/`listSessions`/`getSession`/`renameSession`/`deleteSession`/`listCharacters`/`deleteCharacter`/`editClipPrompt`) match `src/lib/api.ts`.

## Execution Handoff

This is the final migration plan. After Task 8, the app is a single Next.js App-Router application on Cloudflare Workers (D1 + S3 + password auth), Vite fully removed. Optional follow-up cleanup (separate, non-blocking): delete the now-dead client-fal orchestrators in `src/services/studio/generate.ts` and the dead `run()`/`configureFal`/`uploadAsset` in `src/services/fal/client.ts` that neither the client nor the server imports, and bump `wrangler.jsonc`'s `database_id` from the `"local"` placeholder to a real one (`wrangler d1 create`) before a production `--remote` deploy.
