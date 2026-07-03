# Backend Migration — Plan 2b: Supabase → Cloudflare D1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase Postgres DB layer (built in Plan 2, wired in Plan 3) with **Cloudflare D1** (SQLite), a native Workers binding — reusing the pure mappers, pipeline, auth, and S3 wrapper unchanged. After this, the DB runs locally under `wrangler dev` with no external service, so the pipeline live smoke needs no DB provisioning (only a fal key + AWS S3 creds for media).

**Architecture:** The repositories keep their signatures (each takes a DB handle as its first arg) but their bodies move from the `@supabase/supabase-js` fluent builder to D1 prepared statements (`db.prepare(sql).bind(...).first()/.all()/.run()`). JSON columns are stored as `TEXT` and parsed/stringified in the repo (mappers still receive/return the same `*Row` object shapes). Row ids are app-generated (`crypto.randomUUID()`). Route handlers get the real `D1Database` from `getCloudflareContext().env.DB`; repo tests inject a `node:sqlite`-backed adapter running **real SQL** (stronger than the old fake-builder mocks).

**Tech Stack:** Cloudflare D1 + `wrangler` (`d1_databases` binding, `d1 migrations`), `@opennextjs/cloudflare` `getCloudflareContext`, `@cloudflare/workers-types` (D1 types), Node's built-in `node:sqlite` (test adapter), Vitest.

## Global Constraints

- Runtime: Cloudflare Workers, `nodejs_compat`. The DB is the `env.DB` D1 binding — NOT env vars. All repo I/O is via the D1 `prepare/bind/first/all/run` API so the SAME repo code runs against the real binding (prod + `wrangler dev` local) and the `node:sqlite` test adapter.
- Reuse, do NOT rewrite: `src/server/db/mappers.ts` (pure), `src/server/db/rows.ts` (row types — unchanged EXCEPT they already match the SQLite columns), the whole `src/server/pipeline/**` + `src/server/fal/**`, auth, and `src/server/storage/s3.ts`. This plan touches ONLY: `client.ts`, the three repo files + their tests, the schema, `wrangler.jsonc`, `app/api/env.ts`, and the five Plan-3 route handlers' DB-handle acquisition.
- SQLite deltas from the Postgres DDL: app-generated `crypto.randomUUID()` TEXT ids (no `gen_random_uuid()`); JSON columns are `TEXT` (repo does `JSON.parse`/`JSON.stringify`); timestamps are ISO `TEXT` (repo writes `new Date().toISOString()`); `duration_sec integer`; keep `name_normalized TEXT GENERATED ALWAYS AS (lower(name)) STORED` + a unique index + `ON CONFLICT(name_normalized)` upsert + `ON DELETE CASCADE` (all supported by D1/SQLite; the test adapter must `PRAGMA foreign_keys = ON`).
- `src/server/**` imports of domain types remain RELATIVE (`../../lib/types`); route files use `@/src/...`.
- No secret values committed. No `Date.now()` ban here (repos legitimately need `new Date().toISOString()` and `crypto.randomUUID()` at runtime — that ban was for the transient-label `uid()` in pipeline/clips.ts only).
- Every task ends green: its vitest passes AND `pnpm typecheck` + `pnpm build` + `pnpm next:build` exit 0.
- Repo tests MUST use the real-SQL `node:sqlite` adapter (Task 3) and assert real persisted behavior (insert then read back, upsert dedup by normalized name, cascade delete) — NOT fake-builder call-watching. Add `// @vitest-environment node` to repo test files (they use `node:sqlite`).

---

## File Structure

- `wrangler.jsonc` — add `d1_databases` binding `DB` + `migrations_dir`.
- `migrations/0001_init.sql` — the D1 (SQLite) schema (replaces `supabase/migrations/0001_init.sql`, which is deleted).
- `worker-configuration.d.ts` (or `cloudflare-env.d.ts`) — types the `env.DB: D1Database` binding for `getCloudflareContext`.
- `src/server/db/client.ts` — `getDb(): D1Database` via `getCloudflareContext().env.DB` (replaces `getSupabase`).
- `src/server/db/schema.ts` — exports the schema SQL as a string constant (so the test adapter and any programmatic apply share one source). OR the test adapter reads `migrations/0001_init.sql` — pick the string-constant approach for a hermetic test.
- `src/server/db/test-d1.ts` — `makeTestDb(): D1Database` — a `node:sqlite`-backed adapter implementing the D1 subset, with the schema applied and `PRAGMA foreign_keys = ON`. Test-only.
- `src/server/db/sessions.ts`, `clips.ts`, `characters.ts` — repo bodies rewritten to D1; signatures unchanged (first arg typed `D1Database`).
- `app/api/env.ts` — drop `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` from `AppEnv`/`readEnv`.
- The five route handlers — swap `getSupabase(readEnv())` → `getDb()`.
- Remove the `@supabase/supabase-js` dependency.

---

### Task 1: D1 binding, env types, and `getDb()`

**Files:**
- Modify: `wrangler.jsonc`, `app/api/env.ts`, `package.json` (add `@cloudflare/workers-types` devDep)
- Create: `worker-configuration.d.ts`, `src/server/db/client.ts` (replace its body)
- Test: none (config/types — verified by typecheck + next:build)

**Interfaces:**
- Produces: `getDb(): D1Database` (from `@opennextjs/cloudflare` `getCloudflareContext().env.DB`); `readEnv()` no longer returns Supabase fields; the `DB` binding declared in `wrangler.jsonc` and typed on `CloudflareEnv`.

- [ ] **Step 1: Add workers-types + declare the binding**

```bash
pnpm add -D @cloudflare/workers-types
```
Create `worker-configuration.d.ts` at repo root:
```ts
import type { D1Database } from '@cloudflare/workers-types'

declare global {
  interface CloudflareEnv {
    DB: D1Database
  }
}
export {}
```
Ensure this file is in the root `tsconfig.json` `include` (it already includes root-level `.ts` via `app/**` etc. — add `"worker-configuration.d.ts"` to `include` if not picked up).

- [ ] **Step 2: Create a local D1 database + wire wrangler.jsonc**

```bash
pnpm wrangler d1 create bookticle-studio-db
```
This prints a `database_id`. Add to `wrangler.jsonc` (keep existing keys):
```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "bookticle-studio-db", "database_id": "<PRINTED_ID>", "migrations_dir": "migrations" }
  ],
```
> If `wrangler d1 create` needs auth/login and can't run in this environment, put a placeholder `database_id: "local"` and note it — local `wrangler dev` works with a placeholder id; the real id is only needed for `--remote`. Record this in the report.

- [ ] **Step 3: Replace `client.ts`**

```ts
// src/server/db/client.ts
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'

export function getDb(): D1Database {
  return getCloudflareContext().env.DB
}
```

- [ ] **Step 4: Drop Supabase from `env.ts`**

In `app/api/env.ts`, remove `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the `AppEnv` interface and the `KEYS` array. `readEnv()` now returns only `FAL_KEY` + the AWS S3 keys.

- [ ] **Step 5: Update `.dev.vars.example` + wrangler comment**

Remove the two `SUPABASE_*` lines from `.dev.vars.example`; update the `wrangler.jsonc` secrets comment to drop them.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm build && pnpm next:build`
Expected: all 0. (Route handlers still import `getSupabase` at this point — they're fixed in Task 6; if typecheck fails on the missing `getSupabase` export, that's expected and resolved in Task 6. To keep THIS task green, temporarily keep a `getSupabase` throwing-stub export in `client.ts` OR do Task 6's route edits in this task. Prefer: keep this task green by leaving a deprecated `getSupabase` that throws `new Error('use getDb')` until Task 6 removes it — note it in the report.)

- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc worker-configuration.d.ts src/server/db/client.ts app/api/env.ts .dev.vars.example package.json tsconfig.json
git commit -m "feat(db): D1 binding + getDb() + workers-types; drop Supabase env"
```

---

### Task 2: SQLite schema migration

**Files:**
- Create: `migrations/0001_init.sql`, `src/server/db/schema.ts`
- Delete: `supabase/migrations/0001_init.sql` (and the empty `supabase/` tree)
- Test: none directly (validated by applying to a local/in-memory SQLite in Task 3)

**Interfaces:**
- Produces: the canonical SQLite DDL, exported as `SCHEMA_SQL` from `schema.ts` for the test adapter and reused as the D1 migration.

- [ ] **Step 1: Write the SQLite schema**

```sql
-- migrations/0001_init.sql
create table if not exists sessions (
  id           text primary key,
  title        text not null,
  brief        text not null,            -- JSON
  plan         text,                     -- JSON | null
  bio_plan     text,                     -- JSON | null
  category     text,
  video_model  text not null,
  created_at   text not null,            -- ISO 8601
  updated_at   text not null
);

create table if not exists clips (
  id           text primary key,
  session_id   text not null references sessions(id) on delete cascade,
  scene_id     text not null,
  title        text not null,
  speakers     text not null default '[]',  -- JSON string[]
  prompt       text not null default '',
  status       text not null default 'pending',
  phase        text,
  request_id   text,
  request_endpoint text,
  image_key    text,
  video_key    text,
  duration_sec integer,
  error        text,
  created_at   text not null
);
create index if not exists clips_session_id_idx on clips(session_id);

create table if not exists character_library (
  id           text primary key,
  name         text not null,
  name_normalized text generated always as (lower(name)) stored,
  image_key    text not null,
  source       text not null default 'minted',
  request_id   text,
  status       text not null default 'done',
  created_at   text not null
);
create unique index if not exists character_library_name_normalized_key on character_library(name_normalized);
```

- [ ] **Step 2: Export it as a string constant**

```ts
// src/server/db/schema.ts
export const SCHEMA_SQL = `
<PASTE THE EXACT CONTENTS OF migrations/0001_init.sql HERE>
`
```
> Keep `schema.ts` and `migrations/0001_init.sql` byte-identical (minus the SQL comment lines if you prefer). The test adapter runs `SCHEMA_SQL`; `wrangler d1 migrations apply` runs the file. Having one authoritative copy avoids drift — if you'd rather not duplicate, have `schema.ts` be the source and generate the migration from it, but a stored duplicate with a "keep in sync" comment is acceptable.

- [ ] **Step 3: Validate it applies (local D1)**

Run: `pnpm wrangler d1 migrations apply bookticle-studio-db --local`
Expected: applies cleanly, creating the tables in the local `.wrangler/` SQLite.
> If wrangler can't run here, defer this check to Task 3 (the `node:sqlite` adapter applying `SCHEMA_SQL` is an equivalent validation of the DDL). Note which you did.

- [ ] **Step 4: Delete the Postgres schema**

```bash
git rm supabase/migrations/0001_init.sql
```
(Remove the now-empty `supabase/` dir.)

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_init.sql src/server/db/schema.ts
git commit -m "feat(db): SQLite (D1) schema; remove Postgres DDL"
```

---

### Task 3: `node:sqlite` D1 test adapter

**Files:**
- Create: `src/server/db/test-d1.ts`
- Test: `src/server/db/test-d1.test.ts` (proves the adapter runs real SQL + the schema applies)

**Interfaces:**
- Produces: `makeTestDb(): D1Database` — an in-memory SQLite (`node:sqlite` `DatabaseSync(':memory:')`) with `PRAGMA foreign_keys = ON` and `SCHEMA_SQL` applied, wrapped to expose the D1 subset the repos use: `prepare(sql).bind(...).first<T>()`, `.all<T>()` (→ `{ results }`), `.run()`, and `db.batch(stmts)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/db/test-d1.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'

describe('test-d1 adapter', () => {
  it('applies the schema and round-trips a row through the D1 surface', async () => {
    const db = makeTestDb()
    await db.prepare('insert into sessions (id,title,brief,video_model,created_at,updated_at) values (?,?,?,?,?,?)')
      .bind('s1', 'T', '{"idea":"x"}', 'm', 'now', 'now').run()
    const row = await db.prepare('select * from sessions where id = ?').bind('s1').first<{ id: string; title: string }>()
    expect(row?.id).toBe('s1')
    expect(row?.title).toBe('T')
    const list = await db.prepare('select * from sessions').all<{ id: string }>()
    expect(list.results).toHaveLength(1)
  })

  it('enforces the name_normalized unique index (case-insensitive)', async () => {
    const db = makeTestDb()
    const ins = (name: string) => db.prepare('insert into character_library (id,name,image_key,created_at) values (?,?,?,?)').bind(crypto.randomUUID(), name, 'k', 'now').run()
    await ins('Robot')
    await expect(ins('robot')).rejects.toThrow() // unique(lower(name)) violation
  })

  it('cascades clip deletes when a session is removed', async () => {
    const db = makeTestDb()
    await db.prepare('insert into sessions (id,title,brief,video_model,created_at,updated_at) values (?,?,?,?,?,?)').bind('s1','T','{}','m','now','now').run()
    await db.prepare('insert into clips (id,session_id,scene_id,title,created_at) values (?,?,?,?,?)').bind('c1','s1','sc','T','now').run()
    await db.prepare('delete from sessions where id = ?').bind('s1').run()
    const clip = await db.prepare('select * from clips where id = ?').bind('c1').first()
    expect(clip).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/db/test-d1.test.ts`
Expected: FAIL — cannot find module `./test-d1`.

- [ ] **Step 3: Write the adapter**

```ts
// src/server/db/test-d1.ts
import { DatabaseSync } from 'node:sqlite'
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types'
import { SCHEMA_SQL } from './schema'

class Stmt implements Partial<D1PreparedStatement> {
  private params: unknown[] = []
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values
    return this as unknown as D1PreparedStatement
  }
  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]))
    return (row as T) ?? null
  }
  async all<T>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]))
    return { results: rows as T[] }
  }
  async run(): Promise<D1Result> {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]))
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } } as unknown as D1Result
  }
}

export function makeTestDb(): D1Database {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql) as unknown as D1PreparedStatement,
    batch: async (stmts: D1PreparedStatement[]) => Promise.all(stmts.map((s) => (s as unknown as Stmt).run())),
  }
  return d1 as unknown as D1Database
}
```
> Notes: `node:sqlite` emits an experimental-warning — harmless in tests. `DatabaseSync.prepare().get/all/run` are synchronous; the adapter wraps them in resolved Promises to match D1's async surface. Positional `?` params map directly. If a repo uses `db.batch`, the adapter runs each statement (no real transaction, fine for tests). The many `as unknown as` casts are confined to this TEST-ONLY adapter — acceptable there; do NOT let casts leak into repo code.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/server/db/test-d1.test.ts`
Expected: PASS (3 tests) — proving real SQL, the unique index, and cascade all work.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/db/test-d1.ts src/server/db/test-d1.test.ts
git commit -m "test(db): node:sqlite D1 adapter for real-SQL repo tests"
```

---

### Task 4: Sessions repo → D1

**Files:**
- Modify: `src/server/db/sessions.ts` (rewrite bodies; keep exported signatures)
- Modify/replace: `src/server/db/sessions.test.ts` (real-SQL via `makeTestDb`, replacing the fake-builder tests)

**Interfaces (unchanged from Plan 2, first arg now `D1Database`):**
- `createSession(db, s: Session): Promise<string>` — generates `id = crypto.randomUUID()`, `now = new Date().toISOString()`; `INSERT INTO sessions (...) VALUES (...)` with `JSON.stringify` for `brief`/`plan`/`bio_plan`; returns the id.
- `getSession(db, id, clips): Promise<Session | null>` — `SELECT * ... WHERE id=?` `.first()`; null if absent; `JSON.parse` the json columns into a `SessionRow`; `rowToSession(row, clips)`.
- `listSessions(db): Promise<SessionSummary[]>` — `SELECT id,title,category,video_model,created_at,updated_at ... ORDER BY updated_at DESC`; map (no JSON columns needed).
- `renameSession(db, id, title): Promise<void>` — `UPDATE ... SET title=?, updated_at=? WHERE id=?`.
- `deleteSession(db, id): Promise<void>` — `DELETE FROM sessions WHERE id=?`.

- [ ] **Step 1: Write the failing real-SQL test**

Rewrite `sessions.test.ts` (`// @vitest-environment node`) using `makeTestDb()`:
```ts
// src/server/db/sessions.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'
import { createSession, getSession, listSessions, renameSession, deleteSession } from './sessions'
import type { Session } from '../../lib/types'

const brief: Session['brief'] = { idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g', aspect: 'landscape', type: 'story', shotSec: 8 }
const mk = (over: Partial<Session> = {}): Session => ({ id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null, category: 'Drama', clips: [], videoModel: 'm', ...over })

describe('sessions repo (D1)', () => {
  it('createSession persists and getSession round-trips (incl. jsonb parse)', async () => {
    const db = makeTestDb()
    const id = await createSession(db, mk({ title: 'Run' }))
    expect(id).toBeTruthy()
    const s = await getSession(db, id, [])
    expect(s?.title).toBe('Run')
    expect(s?.plan?.category).toBe('Drama')     // JSON parsed back into an object
    expect(s?.brief.idea).toBe('x')
    expect(s?.category).toBe('Drama')
  })
  it('getSession returns null for a missing id', async () => {
    expect(await getSession(makeTestDb(), 'nope', [])).toBeNull()
  })
  it('listSessions orders by updated_at desc', async () => {
    const db = makeTestDb()
    const a = await createSession(db, mk({ title: 'A' }))
    const b = await createSession(db, mk({ title: 'B' }))
    await renameSession(db, b, 'B2') // bumps b.updated_at to latest
    const list = await listSessions(db)
    expect(list[0].title).toBe('B2')
    expect(list.map((x) => x.id)).toEqual(expect.arrayContaining([a, b]))
  })
  it('deleteSession removes the row', async () => {
    const db = makeTestDb()
    const id = await createSession(db, mk())
    await deleteSession(db, id)
    expect(await getSession(db, id, [])).toBeNull()
  })
})
```
> These assert REAL persistence (write → read back → JSON round-trip → ordering → delete), a genuine upgrade over the Plan-2 fake-builder tests.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/db/sessions.test.ts`
Expected: FAIL — the current `sessions.ts` still uses supabase-js (`db.from(...)`), which the `node:sqlite` adapter doesn't implement → errors. (This is the RED for the rewrite.)

- [ ] **Step 3: Rewrite `sessions.ts` for D1**

Full example for the two non-trivial functions (follow the same pattern for the rest):
```ts
// src/server/db/sessions.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { Session, Clip } from '../../lib/types'
import type { SessionRow } from './rows'
import { rowToSession } from './mappers'

interface RawSessionRow { id: string; title: string; brief: string; plan: string | null; bio_plan: string | null; category: string | null; video_model: string; created_at: string; updated_at: string }
function parseSession(r: RawSessionRow): SessionRow {
  return { ...r, brief: JSON.parse(r.brief), plan: r.plan ? JSON.parse(r.plan) : null, bio_plan: r.bio_plan ? JSON.parse(r.bio_plan) : null }
}

export async function createSession(db: D1Database, s: Session): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(
    'insert into sessions (id,title,brief,plan,bio_plan,category,video_model,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
  ).bind(id, s.title, JSON.stringify(s.brief), s.plan ? JSON.stringify(s.plan) : null, s.bioPlan ? JSON.stringify(s.bioPlan) : null, s.category, s.videoModel, now, now).run()
  return id
}

export async function getSession(db: D1Database, id: string, clips: Clip[]): Promise<Session | null> {
  const raw = await db.prepare('select * from sessions where id = ?').bind(id).first<RawSessionRow>()
  if (!raw) return null
  return rowToSession(parseSession(raw), clips)
}

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>
export async function listSessions(db: D1Database): Promise<SessionSummary[]> {
  const { results } = await db.prepare('select id,title,category,video_model,created_at,updated_at from sessions order by updated_at desc').all<Pick<RawSessionRow, 'id' | 'title' | 'category' | 'video_model' | 'created_at' | 'updated_at'>>()
  return results.map((r) => ({ id: r.id, title: r.title, category: r.category, videoModel: r.video_model, createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at) }))
}

export async function renameSession(db: D1Database, id: string, title: string): Promise<void> {
  await db.prepare('update sessions set title = ?, updated_at = ? where id = ?').bind(title, new Date().toISOString(), id).run()
}
export async function deleteSession(db: D1Database, id: string): Promise<void> {
  await db.prepare('delete from sessions where id = ?').bind(id).run()
}
```
> Also add `getSessionRow(db, id): Promise<SessionRow | null>` (Plan-3 Task 6 added it) — same `select * ... first()` + `parseSession`, returning the parsed row (no clips). Preserve every function the routes import.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/server/db/sessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/db/sessions.ts src/server/db/sessions.test.ts
git commit -m "feat(db): sessions repo on D1 (prepared statements + JSON columns)"
```

---

### Task 5: Clips + characters repos → D1

**Files:**
- Modify: `src/server/db/clips.ts`, `src/server/db/characters.ts` (rewrite bodies)
- Modify/replace: `src/server/db/clips.test.ts`, `src/server/db/characters.test.ts` (real-SQL via `makeTestDb`)

**Interfaces (unchanged; first arg `D1Database`):**
- clips: `insertClips(db, sessionId, clips): Promise<ClipRow[]>` (insert each with `crypto.randomUUID()` id + `now`; `JSON.stringify(speakers)`; return the inserted rows, parsing `speakers` back to `string[]`), `listClipsBySession(db, sessionId): Promise<ClipRow[]>` (order by `created_at asc`, parse speakers), `updateClipStatus(db, id, patch)` (dynamic `UPDATE` of only the provided fields), `getClip(db, id)`, `getClipBySceneId(db, sessionId, sceneId)`.
- characters: `upsertCharacter(db, c, imageKey)` (`INSERT ... ON CONFLICT(name_normalized) DO UPDATE SET image_key=excluded.image_key, source=excluded.source, status=excluded.status, request_id=excluded.request_id` then read back), `insertPendingCharacter(db, c, requestId)` (upsert with `status='queued'` + `request_id`), `finishCharacter(db, id, imageKey)`, `setCharacterError(db, id)`, `getCharacter(db, id)`, `listCharacters(db)`, `deleteCharacter(db, id)`.

- [ ] **Step 1: Write failing real-SQL tests** for both files (`// @vitest-environment node`, `makeTestDb`). Cover, at minimum:
  - clips: `insertClips` then `listClipsBySession` returns them in insert order with `speakers` parsed to an array; `updateClipStatus` sets `status`/`image_key`/`request_id`/`request_endpoint` and a re-read reflects it; `getClipBySceneId` finds the right clip; `getClip` null on missing.
  - characters: `insertPendingCharacter` then `getCharacter` shows `status='queued'`+`request_id`; a SECOND `insertPendingCharacter`/`upsertCharacter` with the same name (different case) UPDATES the same row (no duplicate — asserts `listCharacters().length === 1`) — the real ON CONFLICT behavior; `finishCharacter` flips to `done`+key; `deleteCharacter` removes it.

  Example (characters dedup — the key real-behavior test the old mocks couldn't do):
```ts
it('insertPendingCharacter upserts on normalized name (no duplicate across case/retry)', async () => {
  const db = makeTestDb()
  const c = { id: '', name: 'Robot', url: '', source: 'minted' as const, createdAt: 0 }
  const r1 = await insertPendingCharacter(db, c, 'req-1')
  const r2 = await insertPendingCharacter(db, { ...c, name: 'robot' }, 'req-2')
  const list = await listCharacters(db)
  expect(list).toHaveLength(1)                    // deduped by lower(name)
  expect(r2.request_id).toBe('req-2')             // second call updated the row
  expect(r1.id).toBe(r2.id)                       // same row id
})
```

- [ ] **Step 2: Run → RED** (`pnpm vitest run src/server/db/clips.test.ts src/server/db/characters.test.ts` — fails; bodies still use supabase-js).

- [ ] **Step 3: Rewrite `clips.ts` and `characters.ts` for D1** following the Task-4 sessions pattern (prepared statements, `crypto.randomUUID()`, `new Date().toISOString()`, `JSON.parse`/`stringify` for `speakers`). For `updateClipStatus`, build the `SET` clause from only the keys present in `patch` (bind their values, append `id` last) so partial updates work. For the character upsert, use SQLite `INSERT ... ON CONFLICT(name_normalized) DO UPDATE SET ...` then `SELECT` the row back (or use `RETURNING *`, which D1/SQLite supports).

- [ ] **Step 4: Run → GREEN** (both test files pass).

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm build && pnpm next:build` (all 0).
```bash
git add src/server/db/clips.ts src/server/db/clips.test.ts src/server/db/characters.ts src/server/db/characters.test.ts
git commit -m "feat(db): clips + characters repos on D1 (upsert, partial update, JSON)"
```

---

### Task 6: Rewire routes to D1; remove Supabase

**Files:**
- Modify: the five route handlers — `app/api/plan/route.ts`, `app/api/generate/character/route.ts`, `app/api/generate/scene/route.ts`, `app/api/status/character/[id]/route.ts`, `app/api/status/clip/[id]/route.ts`
- Modify: `src/server/db/client.ts` (remove the temporary `getSupabase` stub if one was left)
- Modify: `package.json` (remove `@supabase/supabase-js`)
- Test: none new (routes verified by typecheck + next:build; the repos are unit-tested)

**Interfaces:** every handler replaces `const db = getSupabase(readEnv())` (and the now-smaller `readEnv()`) with `const db = getDb()`. `readEnv()` is still called where AWS S3 / FAL_KEY are needed (`configureFal(env.FAL_KEY)`, `makeS3(env)`).

- [ ] **Step 1: Swap the DB handle in each route**

In each of the five handlers: remove the `getSupabase` import, import `getDb` from `@/src/server/db/client`, and set `const db = getDb()`. Keep `readEnv()`/`configureFal`/`makeS3` for fal + S3. (S3 routes still need `readEnv()` for the AWS keys.)

- [ ] **Step 2: Remove Supabase**

```bash
pnpm remove @supabase/supabase-js
```
Delete any leftover `getSupabase` stub in `client.ts`. Grep to confirm no `@supabase/supabase-js` or `getSupabase` references remain:
```bash
git grep -n "supabase\|getSupabase" -- src app || echo "clean"
```

- [ ] **Step 3: Verify the whole surface**

Run: `pnpm vitest run && pnpm typecheck && pnpm build && pnpm next:build`
Expected: full suite green; all builds 0; all 9 routes compile. `next:build` proves the routes resolve `getDb`/`getCloudflareContext` and no Supabase import remains.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): route handlers use the D1 binding; remove @supabase/supabase-js"
```

- [ ] **Step 5 *(live smoke — now DB-local!)*: record steps**
With `.dev.vars` (FAL_KEY + AWS S3 keys) and the local D1 applied (`wrangler d1 migrations apply bookticle-studio-db --local`), run `pnpm cf:preview` and exercise the pipeline end-to-end (login → `/api/plan` → mint characters → generate scenes → poll to done → video plays from S3; story + biography). The DB needs no external provisioning. Record this as the Plan-3 live smoke that was previously blocked.

---

## Self-Review

**Spec coverage (the D1 revision):**
- DB is the `env.DB` D1 binding, reached via `getCloudflareContext` → Task 1. ✅
- SQLite schema with app ids / JSON-as-TEXT / generated normalized name / cascade → Task 2. ✅
- Repos on D1 prepared statements, signatures preserved, mappers reused → Tasks 4-5. ✅
- Real-SQL tests replacing fake-builder mocks → Task 3 adapter + Tasks 4-5 tests. ✅
- Routes use the binding; Supabase dependency removed → Task 6. ✅
- Storage stays AWS S3 (untouched). ✅
- The live smoke is now DB-local (only fal + S3 creds needed) → Task 6 Step 5. ✅

**Placeholder scan:** the `<PRINTED_ID>` in wrangler and `<PASTE ...>` in schema.ts are explicit fill-ins the implementer resolves from the `wrangler d1 create` output / the migration file — not left-in vagueness. Everything else is complete code.

**Type/name consistency:** repo signatures (`createSession`/`getSession`/`getSessionRow`/`listSessions`/`renameSession`/`deleteSession`, `insertClips`/`listClipsBySession`/`updateClipStatus`/`getClip`/`getClipBySceneId`, `upsertCharacter`/`insertPendingCharacter`/`finishCharacter`/`setCharacterError`/`getCharacter`/`listCharacters`/`deleteCharacter`) are byte-identical to what Plan-3 routes import; only the first-arg TYPE changes `SupabaseClient`→`D1Database` and the bodies change. `getDb` replaces `getSupabase`. `rowToSession`/`rowToClip`/`rowToCharacter` and all row types are reused unchanged.

## Execution Handoff

This reworks the DB layer only; Plans 4 (Sessions & Characters API + store rewire) and 5 (frontend cutover) resume afterward, now against D1. After Task 6, run the (now DB-local) Plan-3 live smoke before building the UI, per the big-bang-integration caution.
