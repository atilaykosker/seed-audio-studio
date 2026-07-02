# Backend Migration Design — Bookticle Studio

**Date:** 2026-07-02
**Status:** Approved (design)

## Summary

Convert the current browser-only BYOK SPA into a login-gated, server-backed
application. Instead of each user pasting their own fal.ai key into `localStorage`,
a single shared password gates access, one org-wide fal.ai key lives server-side,
and all state (projects, plans, clips, voice library) is persisted in a Supabase
Postgres database with generated audio/video blobs stored in AWS S3.

The app is rebuilt on **Next.js App Router** and deployed to **Cloudflare Workers**
via `@opennextjs/cloudflare`.

## Goals

- Login-gated access with a single shared username/password.
- fal.ai key never reaches the browser — all fal calls happen server-side.
- Durable persistence of projects, clips, and the voice library (replacing `localStorage`).
- Durable storage of generated media in S3 (fal CDN URLs are ephemeral).
- Deployable to Cloudflare Workers.

## Non-Goals

- Per-user accounts, signup, password reset (single shared password only).
- Supabase Auth / Supabase Storage (custom cookie auth + AWS S3 chosen instead).
- Multi-tenant data isolation (all authenticated users share one workspace).
- Billing, usage metering, rate limiting per user.

## Chosen Stack (with rationale)

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router | Server route handlers host the pipeline; frontend ports cleanly from React/Tailwind/zustand |
| Hosting | Cloudflare Workers (`@opennextjs/cloudflare`, `nodejs_compat`) | User requirement |
| Database | Supabase Postgres via `@supabase/supabase-js` | fetch-based client works reliably on Workers (no TCP driver problems) |
| Auth | Custom JWT cookie, single shared password | "One shared password" doesn't map to per-user Supabase Auth |
| Media storage | AWS S3 via `aws4fetch` | User requirement; `aws4fetch` is fetch-based and Worker-friendly |
| Generation | Async queue + client polling | Avoids holding a Worker request open for minutes; respects Worker limits |

### Why not the MongoDB / native-driver path

The official `mongodb` driver relies on TCP/TLS sockets and persistent connection
pools that Workers' stateless model does not support reliably; Atlas Data API was
sunset. Supabase's HTTP/fetch client sidesteps this entirely.

## Architecture

### Layers

1. **Auth layer**
   - `POST /api/login` — compares submitted password against `APP_PASSWORD`
     (stored hashed). On success, sets an HttpOnly, Secure cookie containing a
     JWT signed with `SESSION_SECRET` (HMAC).
   - `POST /api/logout` — clears the cookie.
   - Middleware (`middleware.ts`) verifies the cookie on all pages and `/api/*`
     routes except `/api/login` and the login page.

2. **API layer (Next.js route handlers, server-only)**
   The existing pipeline (`plan.ts`, `generate.ts`, `mintVoice`) moves server-side.
   - `POST /api/plan` — brief → `makePlan()` → persist project + plan to Supabase, return project.
   - `POST /api/generate` — enqueue fal jobs for a project's scenes/voices; write
     `clips` rows with `queue_id` and `status = 'queued'`; return immediately.
   - `GET /api/status/:queueId` — poll a single fal job. When fal reports done,
     download the output, upload to S3, update the `clips` row to `done` + `s3_key`.
   - `GET /api/projects`, `GET /api/projects/:id` — list/read persisted projects+clips.
   - `GET /api/voices`, voice-library mutations — read/reuse minted voices.
   The fal key (`FAL_KEY`) is read from env here and never sent to the client.

3. **Data layer (Supabase Postgres)**

   ```
   projects
     id           uuid pk
     brief        jsonb          -- the one-line brief + type/shot config
     plan         jsonb          -- makePlan() output (characters, scenes)
     bio_plan     jsonb null     -- biography-mode plan when applicable
     created_at   timestamptz

   clips
     id           uuid pk
     project_id   uuid fk -> projects.id
     kind         text           -- 'scene' | 'voice'
     status       text           -- 'queued' | 'running' | 'done' | 'error'
     prompt       text
     queue_id     text null      -- fal queue id while in flight
     s3_key       text null      -- set when done
     error        text null
     created_at   timestamptz

   voice_library
     id           uuid pk
     name         text           -- case-insensitive reuse key
     s3_ref_url   text           -- trimmed reference monologue in S3
     voice_spec   jsonb
     created_at   timestamptz
   ```

4. **Storage layer (AWS S3 via `aws4fetch`)**
   - Generated scene media and minted reference voices are written to S3.
   - Key convention: `projects/{projectId}/clips/{clipId}.<ext>` and
     `voices/{voiceId}.wav`.
   - Postgres stores only S3 keys / reference URLs, never blobs.
   - Playback: client fetches media via a signed S3 URL (or a thin
     `/api/media/:key` proxy that streams from S3 — decided at plan time).

### Data flow (happy path)

```
login (cookie set)
  → client POST /api/plan { brief }
      → makePlan() → insert projects row → return project + plan
  → client POST /api/generate { projectId }
      → for each scene/voice: enqueue fal job, insert clips row (queued)
      → return clip list with queue_ids
  → client polls GET /api/status/:queueId per clip
      → fal done → download output → upload to S3 → update clip (done, s3_key)
  → client plays media from S3 URL
```

### Frontend changes

- Port React/Tailwind/zustand UI into the Next.js App Router app (client components).
- `src/services/fal/*` direct calls are removed from the client; the store now
  calls `/api/*` endpoints. The service modules (`plan.ts`, `generate.ts`,
  `mintVoice`, fal client, error mapping) move server-side and are reused by the
  route handlers.
- `KeyBubble` (BYOK key entry) is replaced by a login screen posting to `/api/login`.
- `runStudio()` in the store is rewired: instead of driving fal directly, it calls
  `/api/plan` then `/api/generate`, then polls `/api/status` and maps results into
  the existing per-clip status / `currentStep` / toast updates.

## Error handling

- `mapFalError()` continues to translate fal errors into `FriendlyError`, now on
  the server; the API returns structured `{ error: FriendlyError }` and the client
  surfaces it through the existing toast path.
- The seed-audio 422 "exceeds 30s" re-trim-and-retry logic stays in the server-side
  `generateScene()`.
- Auth failures return 401; the client redirects to the login screen.
- A `clips` row transitions to `status = 'error'` with an `error` message when a
  fal job fails terminally; the client shows it per clip.

## Environment variables

```
APP_PASSWORD          # hashed shared password
SESSION_SECRET        # HMAC secret for JWT cookie
FAL_KEY               # org-wide fal.ai key
SUPABASE_URL
SUPABASE_SERVICE_KEY  # service-role key (server-only)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
S3_BUCKET
S3_REGION
```

## Constraints carried over from the current app

- seed-audio: ≤3 reference clips per scene, each ≤30s (trim 28s minted / 27s on
  retry); prompts ≤2048 chars; output ≤2 min; EN/ZH only.
- The `guide.ts` system prompt's strict JSON output contract must stay intact;
  `parsePlan()` still depends on a single JSON object with `characters` + `scenes`.

## Open questions to resolve during planning

- Media delivery: signed S3 URLs vs. a `/api/media/:key` streaming proxy.
- Audio trimming currently uses WebAudio (browser). Server-side trimming on Workers
  needs a Worker-compatible approach (e.g. do the trim client-side before upload for
  minted voices, or a WASM/ffmpeg path) — to be decided in the plan.
- Whether to keep the existing Vite app during migration or cut over in one step.
