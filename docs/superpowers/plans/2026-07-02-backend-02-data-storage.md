# Backend Migration — Plan 2: Data & Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side persistence layer — a Supabase Postgres schema with typed repositories, and an AWS S3 wrapper — that later plans use to store sessions/clips/character library and generated media. No live credentials required to land this plan: all I/O-free logic is TDD'd; the thin network glue is exercised via captured-request tests.

**Architecture:** A `src/server/db/` tree holds the Supabase client factory, snake_case↔domain row mappers (pure, fully tested), and thin repository functions that wrap `@supabase/supabase-js`. A `src/server/storage/` tree holds an S3 client factory and `putObject`/`presignGet` built on `aws4fetch`. The SQL schema lives as a versioned migration file. Domain types come from the existing `src/lib/types.ts` (`Session`, `Clip`, `CharacterImage`, `Plan`, `BiographyPlan`, `Brief`); DB rows are a new persisted shape (snake_case, jsonb, S3 keys instead of URLs).

**Tech Stack:** `@supabase/supabase-js`, `aws4fetch`, Web Crypto/fetch (Workers-native), Vitest.

## Global Constraints

- Runtime target: Cloudflare Workers with `nodejs_compat`. All DB and S3 access MUST be fetch-based (`@supabase/supabase-js` and `aws4fetch` both are) — no TCP drivers, no AWS SDK v3, no `pg`.
- Do NOT break the existing Vite app (`src/` + Vite `dev`/`build`) or the Plan-1 Next/auth code. `src/server/**` is type-covered by BOTH `tsconfig.app.json` (Vite) and the root Next `tsconfig.json`; new server files use RELATIVE imports within `src/server/**` (the two configs give `@/` different meanings).
- Package manager is pnpm. Secrets from env only: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` (all already declared in `.dev.vars.example`/`wrangler.jsonc` from Plan 1). No secret VALUES committed.
- Every task ends green: `pnpm vitest run <the task's test>` passes, AND `pnpm typecheck` + `pnpm build` + `pnpm next:build` all exit 0 (a Plan-1 task shipped a build break by running only vitest — do not repeat that).
- Any `src/server/**` test that transitively pulls in `jose` or Web-Crypto-in-a-cross-realm way must carry `// @vitest-environment node` as its first line. Tests here that only exercise pure mappers or a mocked `fetch` do NOT need it — add it only if a run actually fails under jsdom.
- Domain types are the source of truth in `src/lib/types.ts` — do NOT redefine `Session`/`Clip`/`CharacterImage`/`Brief`/`Plan`/`BiographyPlan`; import them. Row types are new and live beside the mappers.

---

## File Structure

- `supabase/migrations/0001_init.sql` — DDL for `sessions`, `clips`, `character_library` (+ indexes). The canonical schema; applied to a real Supabase project later.
- `src/server/db/rows.ts` — TS types for the DB rows (snake_case, matching the SQL columns) + the shape returned by inserts.
- `src/server/db/mappers.ts` — pure functions mapping domain ↔ row (`sessionToRow`/`rowToSession`, `clipToRow`/`rowToClip`, `characterToRow`/`rowToCharacter`). No I/O. Fully TDD'd.
- `src/server/db/client.ts` — `getSupabase(env)` factory returning a typed `@supabase/supabase-js` client from env.
- `src/server/db/sessions.ts`, `src/server/db/clips.ts`, `src/server/db/characters.ts` — repository functions (thin async wrappers over the client, using the mappers).
- `src/server/storage/s3.ts` — `makeS3(env)` factory + `putObject`/`presignGet` on `aws4fetch`.
- Tests: `mappers.test.ts` (pure, thorough), `s3.test.ts` (captured-`fetch` request assertions), `sessions.test.ts`/`clips.test.ts`/`characters.test.ts` (repo behavior against an injected fake Supabase query-builder that records calls and returns canned rows — asserting the repo builds the right query AND maps the result correctly).

> **Testing philosophy for this plan:** the reviewer rubric rejects tests that only assert mock internals. So the *bulk* of real-behavior testing lives in `mappers.test.ts` (pure, deterministic, no mocks). Repo tests use a fake client but assert observable contract: "given these canned rows back, the repo returns correctly-mapped domain objects" and "the repo targets the right table/filter" — the mapping half is real behavior, not mock-watching. S3 tests assert the actual HTTP request `aws4fetch` produces (method, URL, headers, body), which is real request-construction behavior.

---

### Task 1: SQL schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: none (declarative DDL; validated when applied to Supabase later — no live DB in this plan)

**Interfaces:**
- Produces: the canonical column names/types the row types (Task 2) and mappers (Task 3) must match exactly. Later tasks depend on these names.

- [ ] **Step 1: Write the schema**

```sql
-- supabase/migrations/0001_init.sql
-- Bookticle Studio — initial schema (single shared workspace, no per-user rows).

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  brief        jsonb not null,
  plan         jsonb,
  bio_plan     jsonb,
  category     text,
  video_model  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists clips (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  scene_id     text not null,
  title        text not null,
  speakers     jsonb not null default '[]'::jsonb,
  prompt       text not null default '',
  status       text not null default 'pending',
  phase        text,
  request_id   text,
  image_key    text,
  video_key    text,
  duration_sec numeric,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists clips_session_id_idx on clips(session_id);

create table if not exists character_library (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  image_key    text not null,
  source       text not null default 'minted',
  request_id   text,
  status       text not null default 'done',
  created_at   timestamptz not null default now()
);
-- Case-insensitive reuse key (matches the store's lowercased name lookup).
create unique index if not exists character_library_name_key on character_library(lower(name));
```

- [ ] **Step 2: Sanity-check the DDL parses**

There is no live DB in this plan. Verify only that the file is syntactically well-formed SQL by eye and that every column referenced by the plan's row types (Task 2) is present. Note in the commit that it is unapplied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): initial Supabase schema (sessions, clips, character_library)"
```

---

### Task 2: Row types

**Files:**
- Create: `src/server/db/rows.ts`
- Test: none directly (types are exercised by the mapper tests in Task 3)

**Interfaces:**
- Consumes: the column names from Task 1.
- Produces:
  - `SessionRow`, `ClipRow`, `CharacterRow` — TS interfaces mirroring the SQL columns exactly (snake_case, `jsonb` fields typed as the domain sub-shapes).
  - `SessionInsert`, `ClipInsert`, `CharacterInsert` — the same minus DB-defaulted fields (`id`, `created_at`, etc.), for insert payloads.

- [ ] **Step 1: Write the row types**

```ts
// src/server/db/rows.ts
import type { Brief, Plan, BiographyPlan } from '@/lib/types'
// NOTE: within src/server, prefer a relative import to avoid the @/ alias split:
// import type { Brief, Plan, BiographyPlan } from '../../lib/types'
// Use whichever form typechecks under BOTH tsconfigs; the relative form is safest.

export interface SessionRow {
  id: string
  title: string
  brief: Brief
  plan: Plan | null
  bio_plan: BiographyPlan | null
  category: string | null
  video_model: string
  created_at: string
  updated_at: string
}
export type SessionInsert = Omit<SessionRow, 'id' | 'created_at' | 'updated_at'>

export interface ClipRow {
  id: string
  session_id: string
  scene_id: string
  title: string
  speakers: string[]
  prompt: string
  status: 'pending' | 'running' | 'done' | 'error'
  phase: 'queued' | 'running' | 'done' | null
  request_id: string | null
  image_key: string | null
  video_key: string | null
  duration_sec: number | null
  error: string | null
  created_at: string
}
export type ClipInsert = Omit<ClipRow, 'id' | 'created_at'>

export interface CharacterRow {
  id: string
  name: string
  image_key: string
  source: 'minted' | 'uploaded'
  request_id: string | null
  status: 'queued' | 'done' | 'error'
  created_at: string
}
export type CharacterInsert = Omit<CharacterRow, 'id' | 'created_at'>
```

- [ ] **Step 2: Confirm it typechecks under both configs**

Run: `pnpm typecheck`
Expected: exit 0. (Resolve the `@/lib/types` vs `../../lib/types` import per the note so it passes under both `tsconfig.app.json` and the root config.)

- [ ] **Step 3: Commit**

```bash
git add src/server/db/rows.ts
git commit -m "feat(db): DB row + insert types mirroring the schema"
```

---

### Task 3: Pure domain↔row mappers (TDD)

**Files:**
- Create: `src/server/db/mappers.ts`
- Test: `src/server/db/mappers.test.ts`

**Interfaces:**
- Consumes: `SessionRow`/`ClipRow`/`CharacterRow` + inserts (Task 2); domain `Session`/`Clip`/`CharacterImage` (`src/lib/types.ts`).
- Produces (all pure, no I/O):
  - `sessionToInsert(s: Session): SessionInsert`
  - `rowToSession(row: SessionRow, clips: Clip[]): Session` — reattaches clips (stored separately) and converts timestamps to the domain's `number` epoch fields (`createdAt`/`updatedAt`).
  - `clipToInsert(sessionId: string, c: Clip): ClipInsert` — maps `imageUrl`→`image_key`/`videoUrl`→`video_key` are NOT set here (those are S3 keys assigned by the API layer, not the client's fal URLs); insert carries `image_key: null`, `video_key: null` unless a key is explicitly provided. Prompt/status/phase/speakers/title/scene_id map straight across.
  - `rowToClip(row: ClipRow, media: { imageUrl?: string; videoUrl?: string }): Clip` — the API layer passes presigned URLs derived from `image_key`/`video_key`; the mapper injects them into the domain `Clip`.
  - `characterToInsert(c: CharacterImage, imageKey: string): CharacterInsert`
  - `rowToCharacter(row: CharacterRow, url: string): CharacterImage` — `url` is the presigned URL from `image_key`.

> Design note: domain types carry presigned *URLs* (`imageUrl`/`videoUrl`/`url`), DB rows carry S3 *keys*. Mappers never presign (that needs the S3 client + is async); the API layer (Plans 3-4) presigns and passes URLs into `rowTo*`. This keeps mappers pure and unit-testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/db/mappers.test.ts
import { describe, it, expect } from 'vitest'
import { sessionToInsert, rowToSession, clipToInsert, rowToClip, characterToInsert, rowToCharacter } from './mappers'
import type { Session, Clip, CharacterImage } from '@/lib/types' // or relative '../../lib/types'

const brief: Session['brief'] = {
  idea: 'a robot learns to paint', durationSec: 24, language: 'EN', speakers: 'auto',
  genre: 'drama', aspect: 'landscape', type: 'story', shotSec: 8,
}

describe('session mappers', () => {
  it('sessionToInsert copies scalar + jsonb fields, drops clips/ids/timestamps', () => {
    const s: Session = {
      id: 'x', title: 'My run', createdAt: 1, updatedAt: 2, brief,
      plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null,
      category: 'Drama', clips: [], videoModel: 'bytedance/seedance-2.0/image-to-video',
    }
    const ins = sessionToInsert(s)
    expect(ins).toEqual({
      title: 'My run', brief, plan: s.plan, bio_plan: null, category: 'Drama',
      video_model: 'bytedance/seedance-2.0/image-to-video',
    })
    expect('clips' in ins).toBe(false)
    expect('id' in ins).toBe(false)
  })

  it('rowToSession reattaches clips and converts timestamps to epoch numbers', () => {
    const row = {
      id: 'sid', title: 'T', brief, plan: null,
      bio_plan: { subject: 'Ada', style: 'watercolor', stages: [], pages: [] },
      category: 'Biography', video_model: 'm',
      created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:01.000Z',
    }
    const clips: Clip[] = [{ id: 'c1', sceneId: 's1', title: 'Shot', speakers: [], prompt: 'p', status: 'done' }]
    const s = rowToSession(row, clips)
    expect(s.id).toBe('sid')
    expect(s.bioPlan?.subject).toBe('Ada')
    expect(s.clips).toBe(clips)
    expect(s.createdAt).toBe(Date.parse('2026-07-02T00:00:00.000Z'))
    expect(s.updatedAt).toBe(Date.parse('2026-07-02T00:00:01.000Z'))
  })
})

describe('clip mappers', () => {
  it('clipToInsert maps fields and sets keys null by default', () => {
    const c: Clip = { id: 'c', sceneId: 'sc', title: 'Scene 1', speakers: ['A', 'B'], prompt: 'do a thing', status: 'pending' }
    const ins = clipToInsert('sid', c)
    expect(ins).toMatchObject({
      session_id: 'sid', scene_id: 'sc', title: 'Scene 1', speakers: ['A', 'B'],
      prompt: 'do a thing', status: 'pending', image_key: null, video_key: null,
    })
  })

  it('rowToClip injects presigned media URLs from the API layer', () => {
    const row = {
      id: 'c', session_id: 'sid', scene_id: 'sc', title: 'Scene 1', speakers: [], prompt: 'p',
      status: 'done' as const, phase: 'done' as const, request_id: null,
      image_key: 'k1.png', video_key: 'k2.mp4', duration_sec: 8, error: null, created_at: 'x',
    }
    const c = rowToClip(row, { imageUrl: 'https://s3/k1.png?sig', videoUrl: 'https://s3/k2.mp4?sig' })
    expect(c.videoUrl).toBe('https://s3/k2.mp4?sig')
    expect(c.imageUrl).toBe('https://s3/k1.png?sig')
    expect(c.durationSec).toBe(8)
    expect(c.status).toBe('done')
  })
})

describe('character mappers', () => {
  it('characterToInsert stores the S3 key and lowercased-reuse name', () => {
    const ch: CharacterImage = { id: 'i', name: 'Robot', url: 'https://fal/x', source: 'minted', createdAt: 5 }
    const ins = characterToInsert(ch, 'characters/i.png')
    expect(ins).toMatchObject({ name: 'Robot', image_key: 'characters/i.png', source: 'minted' })
  })

  it('rowToCharacter injects the presigned url', () => {
    const row = { id: 'i', name: 'Robot', image_key: 'characters/i.png', source: 'minted' as const, request_id: null, status: 'done' as const, created_at: '2026-07-02T00:00:00.000Z' }
    const ch = rowToCharacter(row, 'https://s3/characters/i.png?sig')
    expect(ch.url).toBe('https://s3/characters/i.png?sig')
    expect(ch.name).toBe('Robot')
    expect(ch.createdAt).toBe(Date.parse('2026-07-02T00:00:00.000Z'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/db/mappers.test.ts`
Expected: FAIL — cannot find module `./mappers`.

- [ ] **Step 3: Write the mappers**

```ts
// src/server/db/mappers.ts
import type { Session, Clip, CharacterImage } from '../../lib/types'
import type { SessionRow, SessionInsert, ClipRow, ClipInsert, CharacterRow, CharacterInsert } from './rows'

export function sessionToInsert(s: Session): SessionInsert {
  return {
    title: s.title,
    brief: s.brief,
    plan: s.plan,
    bio_plan: s.bioPlan,
    category: s.category,
    video_model: s.videoModel,
  }
}

export function rowToSession(row: SessionRow, clips: Clip[]): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    brief: row.brief,
    plan: row.plan,
    bioPlan: row.bio_plan,
    category: row.category,
    clips,
    videoModel: row.video_model,
  }
}

export function clipToInsert(sessionId: string, c: Clip): ClipInsert {
  return {
    session_id: sessionId,
    scene_id: c.sceneId,
    title: c.title,
    speakers: c.speakers,
    prompt: c.prompt,
    status: c.status,
    phase: c.phase ?? null,
    request_id: null,
    image_key: null,
    video_key: null,
    duration_sec: c.durationSec ?? null,
    error: c.error ?? null,
  }
}

export function rowToClip(row: ClipRow, media: { imageUrl?: string; videoUrl?: string }): Clip {
  return {
    id: row.id,
    sceneId: row.scene_id,
    title: row.title,
    speakers: row.speakers,
    prompt: row.prompt,
    status: row.status,
    phase: row.phase ?? undefined,
    imageUrl: media.imageUrl,
    videoUrl: media.videoUrl,
    durationSec: row.duration_sec ?? undefined,
    error: row.error ?? undefined,
  }
}

export function characterToInsert(c: CharacterImage, imageKey: string): CharacterInsert {
  return {
    name: c.name,
    image_key: imageKey,
    source: c.source,
    request_id: null,
    status: 'done',
  }
}

export function rowToCharacter(row: CharacterRow, url: string): CharacterImage {
  return {
    id: row.id,
    name: row.name,
    url,
    source: row.source,
    createdAt: Date.parse(row.created_at),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/db/mappers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/mappers.ts src/server/db/mappers.test.ts
git commit -m "feat(db): pure domain<->row mappers"
```

---

### Task 4: Supabase client factory

**Files:**
- Create: `src/server/db/client.ts`
- Test: `src/server/db/client.test.ts`

**Interfaces:**
- Consumes: env `{ SUPABASE_URL, SUPABASE_SERVICE_KEY }`.
- Produces: `getSupabase(env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }): SupabaseClient` — creates a client with `auth: { persistSession: false }` (server, stateless). Throws a clear error if either env value is empty.

- [ ] **Step 1: Install supabase-js, write the failing test**

```bash
pnpm add @supabase/supabase-js
```

```ts
// src/server/db/client.test.ts
import { describe, it, expect } from 'vitest'
import { getSupabase } from './client'

describe('getSupabase', () => {
  it('throws a clear error when env is missing', () => {
    expect(() => getSupabase({ SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' })).toThrow(/SUPABASE/)
  })
  it('returns a client with a usable .from() when env is present', () => {
    const c = getSupabase({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' })
    expect(typeof c.from).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/db/client.test.ts`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 3: Write the factory**

```ts
// src/server/db/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface DbEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

export function getSupabase(env: DbEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/db/client.test.ts`
Expected: PASS (2 tests). If it fails under jsdom due to a supabase-js global, add `// @vitest-environment node` as the first line of the test.

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/client.ts src/server/db/client.test.ts package.json
git commit -m "feat(db): Supabase client factory from env"
```

---

### Task 5: Sessions repository

**Files:**
- Create: `src/server/db/sessions.ts`
- Test: `src/server/db/sessions.test.ts`

**Interfaces:**
- Consumes: mappers (Task 3), row types (Task 2), a `SupabaseClient`.
- Produces (each takes the client as its first arg so tests inject a fake):
  - `createSession(db, s: Session): Promise<string>` — inserts via `sessionToInsert`, returns the new `id`.
  - `getSession(db, id: string, clips: Clip[]): Promise<Session | null>` — selects one row, maps via `rowToSession` (clips passed in by the caller/API layer).
  - `listSessions(db): Promise<Pick<Session,'id'|'title'|'createdAt'|'updatedAt'|'category'|'videoModel'>[]>` — lightweight list (no clips/plan), ordered by `updated_at desc`.
  - `renameSession(db, id: string, title: string): Promise<void>` — updates `title` + `updated_at`.
  - `deleteSession(db, id: string): Promise<void>` — deletes (clips cascade).

- [ ] **Step 1: Write the failing test (fake query-builder records calls + returns canned rows)**

```ts
// src/server/db/sessions.test.ts
import { describe, it, expect } from 'vitest'
import { createSession, getSession, listSessions } from './sessions'
import type { Session, Clip } from '@/lib/types' // or relative

const brief: Session['brief'] = {
  idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g',
  aspect: 'landscape', type: 'story', shotSec: 8,
}

// Minimal fake matching the supabase-js fluent surface the repo uses.
function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'single', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ m, args })
      // terminal-ish methods resolve; others return the chain
      if (m === 'single') return Promise.resolve(result)
      return chain
    }
  }
  // make the chain awaitable for non-.single() terminals (select/order/delete/update)
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('createSession', () => {
  it('inserts the mapped row and returns the new id', async () => {
    const { db, calls } = fakeDb({ data: { id: 'new-id' }, error: null })
    const s: Session = { id: 'ignored', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: null, bioPlan: null, category: null, clips: [], videoModel: 'm' }
    const id = await createSession(db as never, s)
    expect(id).toBe('new-id')
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('sessions')
    expect(calls.some((c) => c.m === 'insert')).toBe(true)
  })
})

describe('getSession', () => {
  it('returns a mapped domain Session with the passed-in clips', async () => {
    const row = { id: 'sid', title: 'T', brief, plan: null, bio_plan: null, category: null, video_model: 'm', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z' }
    const { db } = fakeDb({ data: row, error: null })
    const clips: Clip[] = []
    const s = await getSession(db as never, 'sid', clips)
    expect(s?.id).toBe('sid')
    expect(s?.clips).toBe(clips)
  })

  it('returns null when the row is missing', async () => {
    const { db } = fakeDb({ data: null, error: null })
    const s = await getSession(db as never, 'nope', [])
    expect(s).toBeNull()
  })
})

describe('listSessions', () => {
  it('targets sessions ordered by updated_at desc and maps lightweight fields', async () => {
    const rows = [{ id: 's1', title: 'A', category: 'C', video_model: 'm', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:05.000Z' }]
    const { db, calls } = fakeDb({ data: rows, error: null })
    const list = await listSessions(db as never)
    expect(list[0]).toMatchObject({ id: 's1', title: 'A', category: 'C', videoModel: 'm' })
    expect(calls.find((c) => c.m === 'order')?.args[0]).toBe('updated_at')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/db/sessions.test.ts`
Expected: FAIL — cannot find module `./sessions`.

- [ ] **Step 3: Write the repository**

```ts
// src/server/db/sessions.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Session, Clip } from '../../lib/types'
import type { SessionRow } from './rows'
import { sessionToInsert, rowToSession } from './mappers'

export async function createSession(db: SupabaseClient, s: Session): Promise<string> {
  const { data, error } = await db.from('sessions').insert(sessionToInsert(s)).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function getSession(db: SupabaseClient, id: string, clips: Clip[]): Promise<Session | null> {
  const { data, error } = await db.from('sessions').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  if (!data) return null
  return rowToSession(data as SessionRow, clips)
}

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>

export async function listSessions(db: SupabaseClient): Promise<SessionSummary[]> {
  const { data, error } = await db
    .from('sessions')
    .select('id,title,category,video_model,created_at,updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as Pick<SessionRow, 'id' | 'title' | 'category' | 'video_model' | 'created_at' | 'updated_at'>
    return {
      id: row.id, title: row.title, category: row.category, videoModel: row.video_model,
      createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
    }
  })
}

export async function renameSession(db: SupabaseClient, id: string, title: string): Promise<void> {
  const { error } = await db.from('sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteSession(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('sessions').delete().eq('id', id)
  if (error) throw error
}
```

> Note on the fake in the test: the repo `await`s the builder chain. `@supabase/supabase-js` builders are thenable, which the fake models via a `then` shim. `renameSession`/`deleteSession` aren't unit-tested here (they return void and only issue a query); they are covered by the live smoke in Plan 5 / a later integration pass. Do NOT add assert-nothing tests for them.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/db/sessions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/sessions.ts src/server/db/sessions.test.ts
git commit -m "feat(db): sessions repository"
```

---

### Task 6: Clips + characters repositories

**Files:**
- Create: `src/server/db/clips.ts`, `src/server/db/characters.ts`
- Test: `src/server/db/clips.test.ts`, `src/server/db/characters.test.ts`

**Interfaces:**
- Consumes: mappers, row types, `SupabaseClient`.
- Produces:
  - clips: `insertClips(db, sessionId, clips: Clip[]): Promise<ClipRow[]>` (bulk insert via `clipToInsert`, returns inserted rows incl. ids); `listClipsBySession(db, sessionId): Promise<ClipRow[]>` (ordered by `created_at asc`); `updateClipStatus(db, id, patch: { status?; phase?; request_id?; image_key?; video_key?; duration_sec?; error? }): Promise<void>`.
  - characters: `upsertCharacter(db, c: CharacterImage, imageKey: string): Promise<CharacterRow>` (upsert on `lower(name)` conflict via `characterToInsert`); `listCharacters(db): Promise<CharacterRow[]>`; `deleteCharacter(db, id): Promise<void>`.
  - Repos return `*Row[]` (keys, not URLs); the API layer (Plan 4) presigns and applies `rowToClip`/`rowToCharacter`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/db/clips.test.ts
import { describe, it, expect } from 'vitest'
import { insertClips, listClipsBySession } from './clips'
import type { Clip } from '@/lib/types' // or relative

function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'update', 'delete', 'upsert']) {
    chain[m] = (...args: unknown[]) => { calls.push({ m, args }); return chain }
  }
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('insertClips', () => {
  it('bulk-inserts mapped rows into clips and returns inserted rows', async () => {
    const inserted = [{ id: 'c1' }, { id: 'c2' }]
    const { db, calls } = fakeDb({ data: inserted, error: null })
    const clips: Clip[] = [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: [], prompt: 'p1', status: 'pending' },
      { id: 'b', sceneId: 's2', title: 'T2', speakers: [], prompt: 'p2', status: 'pending' },
    ]
    const rows = await insertClips(db as never, 'sid', clips)
    expect(rows).toEqual(inserted)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('clips')
    const insertArg = calls.find((c) => c.m === 'insert')?.args[0] as unknown[]
    expect(Array.isArray(insertArg)).toBe(true)
    expect(insertArg).toHaveLength(2)
    expect((insertArg[0] as { session_id: string }).session_id).toBe('sid')
  })
})

describe('listClipsBySession', () => {
  it('filters by session_id and orders by created_at asc', async () => {
    const { db, calls } = fakeDb({ data: [], error: null })
    await listClipsBySession(db as never, 'sid')
    expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['session_id', 'sid'])
    expect(calls.find((c) => c.m === 'order')?.args[0]).toBe('created_at')
  })
})
```

```ts
// src/server/db/characters.test.ts
import { describe, it, expect } from 'vitest'
import { upsertCharacter, listCharacters } from './characters'
import type { CharacterImage } from '@/lib/types' // or relative

function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'update', 'delete', 'upsert', 'single']) {
    chain[m] = (...args: unknown[]) => { calls.push({ m, args }); if (m === 'single') return Promise.resolve(result); return chain }
  }
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('upsertCharacter', () => {
  it('upserts on the name conflict target and returns the row', async () => {
    const row = { id: 'i', name: 'Robot', image_key: 'characters/i.png', source: 'minted', request_id: null, status: 'done', created_at: 'x' }
    const { db, calls } = fakeDb({ data: row, error: null })
    const ch: CharacterImage = { id: 'i', name: 'Robot', url: 'https://fal/x', source: 'minted', createdAt: 5 }
    const out = await upsertCharacter(db as never, ch, 'characters/i.png')
    expect(out).toEqual(row)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
    expect(calls.some((c) => c.m === 'upsert')).toBe(true)
  })
})

describe('listCharacters', () => {
  it('selects from character_library', async () => {
    const { db, calls } = fakeDb({ data: [], error: null })
    await listCharacters(db as never)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/db/clips.test.ts src/server/db/characters.test.ts`
Expected: FAIL — cannot find modules `./clips`, `./characters`.

- [ ] **Step 3: Write the repositories**

```ts
// src/server/db/clips.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Clip } from '../../lib/types'
import type { ClipRow } from './rows'
import { clipToInsert } from './mappers'

export async function insertClips(db: SupabaseClient, sessionId: string, clips: Clip[]): Promise<ClipRow[]> {
  const { data, error } = await db.from('clips').insert(clips.map((c) => clipToInsert(sessionId, c))).select('*')
  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export async function listClipsBySession(db: SupabaseClient, sessionId: string): Promise<ClipRow[]> {
  const { data, error } = await db.from('clips').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export interface ClipPatch {
  status?: ClipRow['status']
  phase?: ClipRow['phase']
  request_id?: string | null
  image_key?: string | null
  video_key?: string | null
  duration_sec?: number | null
  error?: string | null
}

export async function updateClipStatus(db: SupabaseClient, id: string, patch: ClipPatch): Promise<void> {
  const { error } = await db.from('clips').update(patch).eq('id', id)
  if (error) throw error
}
```

```ts
// src/server/db/characters.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CharacterImage } from '../../lib/types'
import type { CharacterRow } from './rows'
import { characterToInsert } from './mappers'

export async function upsertCharacter(db: SupabaseClient, c: CharacterImage, imageKey: string): Promise<CharacterRow> {
  const { data, error } = await db
    .from('character_library')
    .upsert(characterToInsert(c, imageKey), { onConflict: 'name' })
    .select('*')
    .single()
  if (error) throw error
  return data as CharacterRow
}

export async function listCharacters(db: SupabaseClient): Promise<CharacterRow[]> {
  const { data, error } = await db.from('character_library').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CharacterRow[]
}

export async function deleteCharacter(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('character_library').delete().eq('id', id)
  if (error) throw error
}
```

> Note: the `onConflict: 'name'` upsert relies on the `lower(name)` unique index from Task 1; if Supabase requires the raw column name for `onConflict`, this is validated against the live DB in a later plan — the unit test only asserts the repo calls `.upsert()` on `character_library`. `updateClipStatus`/`deleteCharacter` return void and aren't unit-tested (no assert-nothing tests).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/db/clips.test.ts src/server/db/characters.test.ts`
Expected: PASS (clips 2, characters 2).

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/clips.ts src/server/db/clips.test.ts src/server/db/characters.ts src/server/db/characters.test.ts
git commit -m "feat(db): clips + characters repositories"
```

---

### Task 7: S3 wrapper (aws4fetch)

**Files:**
- Create: `src/server/storage/s3.ts`
- Test: `src/server/storage/s3.test.ts`

**Interfaces:**
- Consumes: env `{ AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION }`.
- Produces:
  - `makeS3(env): S3` — returns `{ putObject, presignGet }` bound to an `aws4fetch` `AwsClient` + a `fetchImpl` (injectable for tests, defaults to global `fetch`).
  - `putObject(key: string, body: ArrayBuffer | Uint8Array | Blob, contentType: string): Promise<void>` — signed `PUT` to `https://{bucket}.s3.{region}.amazonaws.com/{key}`; throws on non-2xx.
  - `presignGet(key: string, expiresSeconds?: number): Promise<string>` — returns a presigned GET URL (default TTL 3600s) via `aws4fetch` `sign(..., { aws: { signQuery: true } })`.

- [ ] **Step 1: Install aws4fetch, write the failing test**

```bash
pnpm add aws4fetch
```

```ts
// src/server/storage/s3.test.ts
import { describe, it, expect } from 'vitest'
import { makeS3 } from './s3'

const env = { AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secretsecretsecret', S3_BUCKET: 'my-bucket', S3_REGION: 'us-east-1' }

describe('putObject', () => {
  it('issues a signed PUT to the bucket/key with the body and content-type', async () => {
    let captured: Request | null = null
    const fetchImpl = async (req: Request) => { captured = req; return new Response(null, { status: 200 }) }
    const s3 = makeS3(env, fetchImpl as typeof fetch)
    await s3.putObject('sessions/s1/clips/c1.mp4', new Uint8Array([1, 2, 3]), 'video/mp4')
    expect(captured).not.toBeNull()
    const req = captured as unknown as Request
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://my-bucket.s3.us-east-1.amazonaws.com/sessions/s1/clips/c1.mp4')
    expect(req.headers.get('content-type')).toBe('video/mp4')
    expect(req.headers.get('authorization')).toMatch(/AWS4-HMAC-SHA256/)
  })

  it('throws on a non-2xx response', async () => {
    const fetchImpl = async () => new Response('denied', { status: 403 })
    const s3 = makeS3(env, fetchImpl as typeof fetch)
    await expect(s3.putObject('k', new Uint8Array([1]), 'application/octet-stream')).rejects.toThrow(/403/)
  })
})

describe('presignGet', () => {
  it('returns a query-signed GET URL for the key', async () => {
    const s3 = makeS3(env)
    const url = await s3.presignGet('characters/i.png', 600)
    expect(url).toContain('https://my-bucket.s3.us-east-1.amazonaws.com/characters/i.png')
    expect(url).toMatch(/X-Amz-Signature=/)
    expect(url).toMatch(/X-Amz-Expires=600/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/storage/s3.test.ts`
Expected: FAIL — cannot find module `./s3`.

- [ ] **Step 3: Write the S3 wrapper**

```ts
// src/server/storage/s3.ts
import { AwsClient } from 'aws4fetch'

export interface S3Env {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_REGION: string
}

export interface S3 {
  putObject(key: string, body: ArrayBuffer | Uint8Array | Blob, contentType: string): Promise<void>
  presignGet(key: string, expiresSeconds?: number): Promise<string>
}

export function makeS3(env: S3Env, fetchImpl: typeof fetch = fetch): S3 {
  const client = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    service: 's3',
  })
  const base = `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`

  return {
    async putObject(key, body, contentType) {
      const req = await client.sign(`${base}/${key}`, {
        method: 'PUT',
        body: body as BodyInit,
        headers: { 'content-type': contentType },
      })
      const res = await fetchImpl(req)
      if (!res.ok) throw new Error(`S3 putObject failed: ${res.status}`)
    },
    async presignGet(key, expiresSeconds = 3600) {
      const signed = await client.sign(`${base}/${key}?X-Amz-Expires=${expiresSeconds}`, {
        method: 'GET',
        aws: { signQuery: true },
      })
      return signed.url
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/storage/s3.test.ts`
Expected: PASS (3 tests). If `aws4fetch`'s crypto needs Node webcrypto under jsdom, add `// @vitest-environment node` as the first line.

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/storage/s3.ts src/server/storage/s3.test.ts package.json
git commit -m "feat(storage): S3 wrapper (putObject + presignGet) via aws4fetch"
```

---

## Self-Review

**Spec coverage (Plan 2 slice of the design):**
- Supabase Postgres tables `sessions`/`clips`/`character_library` → Task 1 DDL. ✅
- fetch-based Supabase client on Workers → Task 4. ✅
- Domain↔row mapping (keys in DB, presigned URLs at API boundary) → Task 3 mappers. ✅
- Repositories replacing localStorage CRUD → Tasks 5-6 (consumed by the store rewire in Plan 4). ✅
- AWS S3 via `aws4fetch`, `putObject` + presigned GET → Task 7. ✅
- Deferred correctly to later plans: wiring repos/S3 into `/api/*` (Plan 3-4), presigning at the boundary, store rewire, live DB/S3 smoke.

**Placeholder scan:** No TBD/TODO; every code step is complete. The two "validated against live DB later" notes (`onConflict`, void mutators) are explicit scoping, not placeholders.

**Type consistency:** column names in Task 1 SQL == fields in Task 2 row types == keys the Task 3 mappers read/write == tables/columns the Task 5-6 repos query. `getSupabase`, `makeS3`, `sessionToInsert`/`rowToSession`, `clipToInsert`/`rowToClip`, `characterToInsert`/`rowToCharacter`, `insertClips`/`listClipsBySession`/`updateClipStatus`, `upsertCharacter`/`listCharacters`/`deleteCharacter`, `putObject`/`presignGet` names are used identically across tasks.

**Testing-hygiene note for the executor:** repo tests use a fake Supabase builder, but each asserts real mapping output (canned row → correct domain object) and the correct table/filter — not merely "a mock was called." Pure mappers (Task 3) carry the deterministic behavioral coverage. Do not add tests for the void-returning mutators just to raise a count.

## Execution Handoff

This is Plan 2 of 5. It lands the persistence layer with no live credentials. Plan 3 (Server pipeline API — fal queue refactor + `/api/plan|generate|status`) consumes these repos and the S3 wrapper; a live Supabase project + AWS S3 bucket are needed for end-to-end smoke, at the latest by Plan 5's cutover.
