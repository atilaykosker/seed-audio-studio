# Backend Migration — Plan 4: Sessions & Characters API + Client SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the remaining persistence as HTTP — `/api/sessions` (list/get/rename/delete) and `/api/characters` (list/delete), returning domain objects with **presigned S3 URLs** — and ship a single typed **client API module** (`src/lib/api.ts`) wrapping every `/api/*` endpoint. This is the SDK the Next UI (Plan 5) calls; the actual zustand store rewire + UI port happens in Plan 5, when client and API share an origin (so cookies + relative `/api` just work).

**Architecture:** Read endpoints assemble a `Session` (or `CharacterImage[]`) from the D1 repos + presign each stored S3 key via `makeS3(env).presignGet`. A pure-ish `assembleSession(db, s3, id)` helper does the DB-read + presign + mapping (unit-tested with the `node:sqlite` adapter + a fake S3). The client SDK is plain `fetch` with `credentials: 'include'`, typed against the domain types, unit-tested against a mocked `fetch`.

**Tech Stack:** Next App Router route handlers, the Plan-2b D1 repos + Plan-2 S3 wrapper, the pure mappers, `node:sqlite` test adapter, Vitest.

## Global Constraints

- Runtime: Cloudflare Workers, `nodejs_compat`. DB via `getDb()` (D1 binding); S3 via `makeS3(readEnv())`. `configureFal` is NOT needed in these routes (no fal calls). Middleware already gates `/api/*`.
- Reuse: the D1 repos (`listSessions`/`getSession`/`getSessionRow`/`renameSession`/`deleteSession`/`listClipsBySession`/`getClip`; `listCharacters`/`deleteCharacter`), the mappers (`rowToClip`/`rowToCharacter`), and `makeS3`. Do NOT reimplement DB or presign logic.
- Presign discipline: DB holds S3 keys; every media field returned to the client is a presigned GET URL (`presignGet(key)`), never a raw key or a fal URL. A clip with no `video_key`/`image_key` yet returns `undefined` for that URL.
- `src/server/**` imports RELATIVE; `app/api/**` routes use `@/src/...`; the client SDK `src/lib/api.ts` is CLIENT code (imported by the Vite/Next UI) — it imports ONLY types from `src/lib/types` (no server modules), uses `fetch`, and must stay bundleable by BOTH Vite and Next.
- Client SDK calls use relative paths (`/api/...`) + `credentials: 'include'` so the session cookie rides along same-origin.
- Every task green: its vitest passes AND `pnpm typecheck` + `pnpm build` + `pnpm next:build` exit 0.
- Repo/assembly tests use real SQL (`makeTestDb`) + a fake S3; SDK tests mock `fetch`. No assert-nothing tests.

## Deferred (to Plan 5, noted so they aren't forgotten)
- The zustand store rewire (`runStudio`/`regenScene`/session+character CRUD → these endpoints + polling) and the login screen — done in Plan 5 with the UI port.
- `editClipPrompt` persistence (it edits a clip's prompt AND writes back into the session's `plan`/`bioPlan`): Plan 5 will add a `PATCH /api/clips/[id]` (or session-plan patch) when wiring the edit UI. Not in this plan.

---

## File Structure

- `src/server/api/assemble.ts` — `assembleSession(db, s3, id): Promise<Session | null>` and `assembleCharacters(db, s3): Promise<CharacterImage[]>` (DB-read + presign + map).
- `app/api/sessions/route.ts` — `GET` list (summaries).
- `app/api/sessions/[id]/route.ts` — `GET` (full session + presigned clips), `PATCH` (rename), `DELETE`.
- `app/api/characters/route.ts` — `GET` list (presigned images).
- `app/api/characters/[id]/route.ts` — `DELETE`.
- `src/lib/api.ts` — the typed client SDK (all endpoints).
- Tests: `src/server/api/assemble.test.ts` (real SQL + fake S3), `src/lib/api.test.ts` (mocked fetch).

---

### Task 1: Session/character assembly helpers (presign + map)

**Files:**
- Create: `src/server/api/assemble.ts`, `src/server/api/assemble.test.ts`

**Interfaces:**
- Consumes: `getSessionRow`/`listClipsBySession` (`../db/sessions`, `../db/clips`), `listCharacters` (`../db/characters`), `rowToClip`/`rowToCharacter` (`../db/mappers`), an `S3` (`../storage/s3`, the `{ presignGet }` shape — inject for tests), domain types.
- Produces:
  - `assembleSession(db: D1Database, s3: Pick<S3,'presignGet'>, id: string): Promise<Session | null>` — `getSessionRow(db,id)`; null if absent. `listClipsBySession(db,id)`; for each clip row, presign `image_key`/`video_key` (only if set) → `rowToClip(row, { imageUrl, videoUrl })`. Return `rowToSession`-equivalent assembled `Session` (reuse the parsed row → build the `Session` with its clips).
  - `assembleCharacters(db: D1Database, s3: Pick<S3,'presignGet'>): Promise<CharacterImage[]>` — `listCharacters(db)`; for each, presign `image_key` (skip rows with empty key / non-done? include all `done`) → `rowToCharacter(row, url)`.

- [ ] **Step 1: Write the failing test (real SQL + fake S3)**

```ts
// src/server/api/assemble.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/test-d1'
import { createSession } from '../db/sessions'
import { insertClips, updateClipStatus } from '../db/clips'
import { upsertCharacter } from '../db/characters'
import { assembleSession, assembleCharacters } from './assemble'
import type { Session, Clip, CharacterImage } from '../../lib/types'

const fakeS3 = { presignGet: async (key: string) => `https://s3.test/${key}?sig` }
const brief: Session['brief'] = { idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g', aspect: 'landscape', type: 'story', shotSec: 8 }

describe('assembleSession', () => {
  it('returns the session with clips carrying presigned media URLs', async () => {
    const db = makeTestDb()
    const s: Session = { id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null, category: 'Drama', clips: [], videoModel: 'm' }
    const id = await createSession(db, s)
    const clip: Clip = { id: 'ignored', sceneId: 'sc1', title: 'Scene 1', speakers: ['A'], prompt: 'p', status: 'pending' }
    const [row] = await insertClips(db, id, [clip])
    await updateClipStatus(db, row.id, { status: 'done', image_key: `sessions/${id}/clips/${row.id}.png`, video_key: `sessions/${id}/clips/${row.id}.mp4` })
    const out = await assembleSession(db, fakeS3, id)
    expect(out?.id).toBe(id)
    expect(out?.category).toBe('Drama')
    expect(out?.clips).toHaveLength(1)
    expect(out?.clips[0].videoUrl).toMatch(/\.mp4\?sig$/)
    expect(out?.clips[0].imageUrl).toMatch(/\.png\?sig$/)
  })
  it('returns null for a missing session', async () => {
    expect(await assembleSession(makeTestDb(), fakeS3, 'nope')).toBeNull()
  })
  it('leaves media URLs undefined for a not-yet-generated clip', async () => {
    const db = makeTestDb()
    const id = await createSession(db, { id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'D', characters: [], scenes: [] }, bioPlan: null, category: 'D', clips: [], videoModel: 'm' })
    await insertClips(db, id, [{ id: 'x', sceneId: 'sc', title: 'S', speakers: [], prompt: 'p', status: 'pending' }])
    const out = await assembleSession(db, fakeS3, id)
    expect(out?.clips[0].videoUrl).toBeUndefined()
    expect(out?.clips[0].imageUrl).toBeUndefined()
  })
})

describe('assembleCharacters', () => {
  it('returns library characters with presigned image URLs', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    await upsertCharacter(db, c, 'characters/robot.png')
    const list = await assembleCharacters(db, fakeS3)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Robot')
    expect(list[0].url).toMatch(/characters\/robot\.png\?sig$/)
  })
})
```

- [ ] **Step 2: RED** — `pnpm vitest run src/server/api/assemble.test.ts` → module not found.

- [ ] **Step 3: Write `assemble.ts`**

```ts
// src/server/api/assemble.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { Session, CharacterImage } from '../../lib/types'
import type { S3 } from '../storage/s3'
import { getSessionRow } from '../db/sessions'
import { listClipsBySession } from '../db/clips'
import { listCharacters } from '../db/characters'
import { rowToSession, rowToClip, rowToCharacter } from '../db/mappers'

type Presigner = Pick<S3, 'presignGet'>

export async function assembleSession(db: D1Database, s3: Presigner, id: string): Promise<Session | null> {
  const row = await getSessionRow(db, id)
  if (!row) return null
  const clipRows = await listClipsBySession(db, id)
  const clips = await Promise.all(
    clipRows.map(async (c) => {
      const imageUrl = c.image_key ? await s3.presignGet(c.image_key) : undefined
      const videoUrl = c.video_key ? await s3.presignGet(c.video_key) : undefined
      return rowToClip(c, { imageUrl, videoUrl })
    }),
  )
  return rowToSession(row, clips)
}

export async function assembleCharacters(db: D1Database, s3: Presigner): Promise<CharacterImage[]> {
  const rows = await listCharacters(db)
  return Promise.all(rows.map(async (r) => rowToCharacter(r, r.image_key ? await s3.presignGet(r.image_key) : '')))
}
```

- [ ] **Step 4: GREEN** — `pnpm vitest run src/server/api/assemble.test.ts` → all pass.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/api/assemble.ts src/server/api/assemble.test.ts
git commit -m "feat(api): session/character assembly with presigned S3 URLs"
```

---

### Task 2: `/api/sessions` routes

**Files:**
- Create: `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`
- Test: none new unit (logic = tested `assembleSession` + repos); verified by typecheck/next:build + live smoke

**Interfaces:**
- `GET /api/sessions` → `{ sessions: SessionSummary[] }` via `listSessions(getDb())`.
- `GET /api/sessions/[id]` → the full `Session` (presigned clips) via `assembleSession(getDb(), makeS3(readEnv()), id)`; 404 if null.
- `PATCH /api/sessions/[id]` → body `{ title }` → `renameSession`; `{ ok: true }`.
- `DELETE /api/sessions/[id]` → `deleteSession`; `{ ok: true }` (clips cascade).

- [ ] **Step 1: Write `app/api/sessions/route.ts`**

```ts
// app/api/sessions/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { listSessions } from '@/src/server/db/sessions'

export async function GET() {
  const sessions = await listSessions(getDb())
  return NextResponse.json({ sessions })
}
```

- [ ] **Step 2: Write `app/api/sessions/[id]/route.ts`**

```ts
// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { readEnv } from '../../env'
import { makeS3 } from '@/src/server/storage/s3'
import { assembleSession } from '@/src/server/api/assemble'
import { renameSession, deleteSession } from '@/src/server/db/sessions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await assembleSession(getDb(), makeS3(readEnv()), id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ session })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title } = (await req.json().catch(() => ({}))) as { title?: string }
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  await renameSession(getDb(), id, title)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteSession(getDb(), id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0; the 3 session routes compile).
```bash
git add app/api/sessions/route.ts "app/api/sessions/[id]/route.ts"
git commit -m "feat(api): /api/sessions list/get/rename/delete"
```

---

### Task 3: `/api/characters` routes

**Files:**
- Create: `app/api/characters/route.ts`, `app/api/characters/[id]/route.ts`

**Interfaces:**
- `GET /api/characters` → `{ characters: CharacterImage[] }` via `assembleCharacters(getDb(), makeS3(readEnv()))`.
- `DELETE /api/characters/[id]` → `deleteCharacter`; `{ ok: true }`.

- [ ] **Step 1: Write the two route files**

```ts
// app/api/characters/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { readEnv } from '../env'
import { makeS3 } from '@/src/server/storage/s3'
import { assembleCharacters } from '@/src/server/api/assemble'

export async function GET() {
  const characters = await assembleCharacters(getDb(), makeS3(readEnv()))
  return NextResponse.json({ characters })
}
```

```ts
// app/api/characters/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { deleteCharacter } from '@/src/server/db/characters'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteCharacter(getDb(), id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add app/api/characters/route.ts "app/api/characters/[id]/route.ts"
git commit -m "feat(api): /api/characters list/delete"
```

---

### Task 4: Typed client API SDK (`src/lib/api.ts`)

**Files:**
- Create: `src/lib/api.ts`, `src/lib/api.test.ts`

**Interfaces:** a typed wrapper over every `/api/*` endpoint. All use `fetch` with `credentials: 'include'` and relative `/api/...` paths. Errors: a non-2xx throws an `ApiError` carrying the parsed `{ error }` body (a `FriendlyError` where the server sent one). Functions (return the domain types):
- `login(password: string): Promise<void>`, `logout(): Promise<void>`
- `createPlan(brief: Brief, opts?: { model?: string; videoModel?: string }): Promise<{ sessionId: string; plan?: Plan; bioPlan?: BiographyPlan; category: string | null; clips: Clip[] }>`
- `generateCharacter(character: Character): Promise<{ characterId: string; requestId: string }>` and `generateStage(subject: string, stage: BioStage, style: string): Promise<{ characterId: string; requestId: string }>`
- `characterStatus(id: string): Promise<{ status: string; url?: string; error?: FriendlyError }>`
- `generateScene(sessionId: string, sceneId: string): Promise<{ requestId: string }>`
- `clipStatus(id: string): Promise<{ status: string; phase?: string; videoUrl?: string; error?: FriendlyError }>`
- `listSessions(): Promise<SessionSummary[]>`, `getSession(id: string): Promise<Session | null>`, `renameSession(id: string, title: string): Promise<void>`, `deleteSession(id: string): Promise<void>`
- `listCharacters(): Promise<CharacterImage[]>`, `deleteCharacter(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test (mock global fetch)**

```ts
// src/lib/api.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as api from './api'

function mockFetch(status: number, body: unknown, capture?: (url: string, init?: RequestInit) => void) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    capture?.(url, init)
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
}
afterEach(() => vi.restoreAllMocks())

describe('api client', () => {
  it('login posts the password with credentials included', async () => {
    let seenUrl = ''; let seenInit: RequestInit | undefined
    vi.stubGlobal('fetch', mockFetch(200, { ok: true }, (u, i) => { seenUrl = u; seenInit = i }))
    await api.login('pw')
    expect(seenUrl).toBe('/api/login')
    expect(seenInit?.method).toBe('POST')
    expect(seenInit?.credentials).toBe('include')
    expect(JSON.parse(String(seenInit?.body))).toEqual({ password: 'pw' })
  })
  it('login throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'invalid' }))
    await expect(api.login('bad')).rejects.toBeInstanceOf(api.ApiError)
  })
  it('listSessions returns the sessions array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { sessions: [{ id: 's1', title: 'T', createdAt: 1, updatedAt: 2, category: 'C', videoModel: 'm' }] }))
    const list = await api.listSessions()
    expect(list[0].id).toBe('s1')
  })
  it('getSession returns null on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    expect(await api.getSession('nope')).toBeNull()
  })
  it('clipStatus returns the parsed status/videoUrl', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'done', videoUrl: 'https://s3/x.mp4?sig' }))
    const s = await api.clipStatus('c1')
    expect(s.status).toBe('done'); expect(s.videoUrl).toContain('.mp4')
  })
})
```

- [ ] **Step 2: RED** — `pnpm vitest run src/lib/api.test.ts` → module not found.

- [ ] **Step 3: Write `src/lib/api.ts`**

```ts
// src/lib/api.ts — client SDK. Types only from ./types; fetch-based; same-origin cookies.
import type { Brief, Plan, BiographyPlan, Clip, Session, CharacterImage, Character, BioStage } from './types'
import type { FriendlyError } from '../services/fal/errors'

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>

export class ApiError extends Error {
  constructor(public status: number, public friendly?: FriendlyError, message?: string) {
    super(message ?? friendly?.message ?? `API error ${status}`)
    this.name = 'ApiError'
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: FriendlyError }).error, typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : undefined)
  return body as T
}

export async function login(password: string): Promise<void> { await call('/api/login', { method: 'POST', body: JSON.stringify({ password }) }) }
export async function logout(): Promise<void> { await call('/api/logout', { method: 'POST' }) }

export function createPlan(brief: Brief, opts: { model?: string; videoModel?: string } = {}): Promise<{ sessionId: string; plan?: Plan; bioPlan?: BiographyPlan; category: string | null; clips: Clip[] }> {
  return call('/api/plan', { method: 'POST', body: JSON.stringify({ brief, ...opts }) })
}
export function generateCharacter(character: Character): Promise<{ characterId: string; requestId: string }> {
  return call('/api/generate/character', { method: 'POST', body: JSON.stringify({ character }) })
}
export function generateStage(subject: string, stage: BioStage, style: string): Promise<{ characterId: string; requestId: string }> {
  return call('/api/generate/character', { method: 'POST', body: JSON.stringify({ stage: { subject, stage, style } }) })
}
export function characterStatus(id: string): Promise<{ status: string; url?: string; error?: FriendlyError }> {
  return call(`/api/status/character/${id}`)
}
export function generateScene(sessionId: string, sceneId: string): Promise<{ requestId: string }> {
  return call('/api/generate/scene', { method: 'POST', body: JSON.stringify({ sessionId, sceneId }) })
}
export function clipStatus(id: string): Promise<{ status: string; phase?: string; videoUrl?: string; error?: FriendlyError }> {
  return call(`/api/status/clip/${id}`)
}
export async function listSessions(): Promise<SessionSummary[]> { return (await call<{ sessions: SessionSummary[] }>('/api/sessions')).sessions }
export async function getSession(id: string): Promise<Session | null> {
  try { return (await call<{ session: Session }>(`/api/sessions/${id}`)).session } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
}
export async function renameSession(id: string, title: string): Promise<void> { await call(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }) }
export async function deleteSession(id: string): Promise<void> { await call(`/api/sessions/${id}`, { method: 'DELETE' }) }
export async function listCharacters(): Promise<CharacterImage[]> { return (await call<{ characters: CharacterImage[] }>('/api/characters')).characters }
export async function deleteCharacter(id: string): Promise<void> { await call(`/api/characters/${id}`, { method: 'DELETE' }) }
```

> `FriendlyError` is imported as a TYPE only from `src/services/fal/errors.ts` — a type import doesn't pull the module's runtime code into the client bundle. If the bundler still complains, copy the `FriendlyError` interface into `src/lib/types.ts` and import it from there.

- [ ] **Step 4: GREEN** — `pnpm vitest run src/lib/api.test.ts` → all pass.

- [ ] **Step 5: Full verification + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0 — the SDK bundles under both Vite and Next).
```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(api): typed client SDK for all /api endpoints"
```

---

### Task 5 *(live smoke — DB-local + real S3)*: verify the new endpoints

**Files:** none (verification only).

- [ ] **Step 1:** With the local D1 applied and `.dev.vars` (real fal + S3) present, `pnpm cf:preview`. Log in (curl → cookie).
- [ ] **Step 2:** Run a plan (`POST /api/plan`) to create a session (or reuse one from the Plan-3 smoke's DB). Then:
  - `GET /api/sessions` → the session appears in the list.
  - `GET /api/sessions/:id` → full session with clips; any generated clip carries a presigned `videoUrl`/`imageUrl` that `curl -I` resolves (200/206).
  - `PATCH /api/sessions/:id {title:'Renamed'}` → 200; re-GET shows the new title.
  - `GET /api/characters` → minted characters with presigned image URLs (curl resolves).
  - `DELETE /api/characters/:id` and `DELETE /api/sessions/:id` → 200; re-GET reflects removal (session delete cascades clips).
- [ ] **Step 3:** Record the observed statuses in the report. (This is a controller/human step; the code is unit-tested + build-verified above.)

---

## Self-Review

**Spec coverage (Plan 4 slice):**
- `/api/sessions` list/get/rename/delete + `/api/characters` list/delete → Tasks 2-3. ✅
- Presigned media on reads → Task 1 `assemble*` + the GET routes. ✅
- Typed client SDK for every endpoint (login/plan/generate/status/sessions/characters) → Task 4. ✅
- Deferred correctly: store rewire + login UI + `editClipPrompt` persistence → Plan 5.

**Placeholder scan:** no TBD; every step has complete code. The live smoke (Task 5) is a real verification checklist, not a placeholder.

**Type/name consistency:** `assembleSession`/`assembleCharacters` names + signatures match their route callers; the SDK function names/return shapes match the endpoints' JSON (`{ sessions }`, `{ session }`, `{ characters }`, `{ ok }`, plan/status shapes from Plan 3). `SessionSummary` matches the repo's `listSessions` return. `rowToSession`/`rowToClip`/`rowToCharacter` reused unchanged.

## Execution Handoff

This is Plan 4 of the migration. Plan 5 (frontend port & cutover) ports the Studio UI into Next, rewires the zustand store to use `src/lib/api.ts` (sessions/characters CRUD + `runStudio`/`regenScene` via `createPlan`/`generate*`/`*Status` polling), replaces `KeyBubble` with a login screen, adds `editClipPrompt` persistence, and deletes the Vite app — all same-origin, so the SDK's relative `/api` + cookies work directly.
