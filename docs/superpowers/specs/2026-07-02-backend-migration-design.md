# Backend Migration Design — Bookticle Studio

**Date:** 2026-07-02
**Status:** Approved (design), corrected to match the real (video) codebase

## Summary

Convert the current browser-only BYOK SPA into a login-gated, server-backed
application. Instead of each user pasting their own fal.ai key into `localStorage`,
a single shared password gates access, one org-wide fal.ai key lives server-side,
and all state (sessions, plans, clips, character library) is persisted in a Supabase
Postgres database with generated **videos and keyframe images** stored in AWS S3.

The app is rebuilt on **Next.js App Router** and deployed to **Cloudflare Workers**
via `@opennextjs/cloudflare`.

> **Domain note:** despite the repo name `seed-audio-studio`, the app (package
> `bookticle-studio`) is a **video** generator. There is no audio pipeline, no voice
> minting, and no WebAudio trimming. Assets are: LLM plan → nano-banana keyframe
> images → fal video models (veo3.1 / seedance / kling). Two parallel flows exist:
> **story** and **biography**.

## Goals

- Login-gated access with a single shared username/password.
- fal.ai key never reaches the browser — all fal calls happen server-side.
- Durable persistence of sessions, plans, clips, and the character library
  (replacing the six `localStorage` keys).
- Durable storage of generated videos and minted keyframe images in S3 (fal CDN
  URLs are ephemeral).
- Deployable to Cloudflare Workers.

## Non-Goals

- Per-user accounts, signup, password reset (single shared password only).
- Supabase Auth / Supabase Storage (custom cookie auth + AWS S3 chosen instead).
- Multi-tenant data isolation (all authenticated users share one workspace).
- Billing, usage metering, per-user rate limiting.
- Any change to the creative pipeline's behavior (prompts, models, flows stay identical).

## Chosen Stack (with rationale)

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js App Router | Server route handlers host the pipeline; UI ports cleanly from React 19/Tailwind v4/zustand |
| Hosting | Cloudflare Workers (`@opennextjs/cloudflare`, `nodejs_compat`) | User requirement |
| Database | Supabase Postgres via `@supabase/supabase-js` | fetch-based client works reliably on Workers (no TCP driver problems) |
| Auth | Custom JWT cookie, single shared password | "One shared password" doesn't map to per-user Supabase Auth |
| Media storage | AWS S3 via `aws4fetch` | User requirement; `aws4fetch` is fetch-based and Worker-friendly |
| Generation | fal **queue** (submit → status → result) + client polling | Video jobs run up to 10 min (`TIMEOUTS.video = 600_000`); a Worker cannot hold a request open that long |

### Why not the MongoDB / native-driver path

The official `mongodb` driver relies on TCP/TLS sockets and persistent connection
pools that Workers' stateless model does not support reliably; Atlas Data API was
sunset. Supabase's HTTP/fetch client sidesteps this entirely.

### Why the generation flow must change from `fal.subscribe` to `fal.queue`

Today `src/services/fal/client.ts` `run()` uses `fal.subscribe` — submit, poll, and
return the result inside one call, blocking up to 10 minutes for video. On Cloudflare
Workers a single request cannot stay open that long. The migration splits this into:
`fal.queue.submit` (server, returns a fal `request_id`) → client polls
`GET /api/status/:requestId` → server calls `fal.queue.status`; when `COMPLETED`,
server fetches the result, downloads the video/image, uploads to S3, and updates the
`clips`/`character_library` row. Sequential orchestration in `generateFromPlan` /
`generateBiography` is replaced by per-asset enqueue + poll driven from the client's
`runStudio()`.

## Architecture

### Layers

1. **Auth layer**
   - `POST /api/login` — compares submitted password against `APP_PASSWORD_HASH`.
     On success, sets an HttpOnly, Secure cookie holding a JWT signed with
     `SESSION_SECRET` (HMAC / `jose`).
   - `POST /api/logout` — clears the cookie.
   - `middleware.ts` verifies the cookie on all pages and `/api/*` routes except
     `/api/login` and the login page.

2. **API layer (Next.js route handlers, server-only)**
   The existing pipeline modules move server-side and are reused verbatim where
   possible (`plan.ts`, `guide.ts`, `generate.ts` internals, `image.ts`, `video.ts`,
   `fal/client.ts`, `fal/errors.ts`). `fal/keyStore.ts` is dropped (key now from env).
   - `POST /api/plan` — `{ brief }` → `makePlan()` **or** `makeBioPlan()` (branch on
     `brief.type`) → persist a `sessions` row with the plan → return session id + plan.
   - `POST /api/generate/asset` — enqueue ONE fal job (a keyframe image or a video),
     insert/patch the owning row with the fal `request_id` and `status='queued'`,
     return `{ requestId }`. The client calls this per character image, per scene, and
     per shot, mirroring the current sequential flow but non-blocking.
   - `GET /api/status/:requestId` — call `fal.queue.status`; on `COMPLETED`, fetch the
     result URL, download the bytes, `PUT` to S3, update the row to `done` + `s3_key`,
     return the terminal state; otherwise return the `queued`/`running` phase.
   - `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id` (rename),
     `DELETE /api/sessions/:id` — replace the store's localStorage session CRUD.
   - `GET/POST/DELETE /api/characters` — replace the character-library localStorage.
   `FAL_KEY` is read from env here and never sent to the client.

3. **Data layer (Supabase Postgres)** — replaces the six `localStorage` keys
   (`:model`, `:videoModel`, `:characters`, `:sessions`, `:activeSession`, `:key`).

   ```
   sessions
     id           uuid pk
     title        text
     brief        jsonb            -- Brief (idea, durationSec, language, speakers, genre, aspect, type, shotSec)
     plan         jsonb null       -- Plan (story mode)
     bio_plan     jsonb null       -- BiographyPlan (biography mode)
     category     text null
     video_model  text             -- selected VideoModelId
     created_at   timestamptz
     updated_at   timestamptz

   clips
     id           uuid pk
     session_id   uuid fk -> sessions.id (on delete cascade)
     scene_id     text             -- Scene.id (story) OR BioShot.id (biography); correlation key
     title        text
     speakers     jsonb            -- string[]
     prompt       text
     status       text             -- 'pending' | 'running' | 'done' | 'error'
     phase        text null        -- 'queued' | 'running' | 'done'
     request_id   text null        -- fal queue id for the video job while in flight
     image_key    text null        -- S3 key of the keyframe (optional)
     video_key    text null        -- S3 key of the finished video
     duration_sec numeric null
     error        text null
     created_at   timestamptz

   character_library
     id           uuid pk
     name         text             -- reuse key (case-insensitive); story: character name, biography: "<subject> — <stage>"
     image_key    text             -- S3 key of the minted keyframe portrait
     source       text             -- 'minted' | 'uploaded'
     request_id   text null        -- fal queue id while minting
     status       text             -- 'queued' | 'done' | 'error'
     created_at   timestamptz
   ```
   `:model` and `:videoModel` (app-level selections) persist per-session on the
   `sessions` row (`video_model`) and, for the LLM model, as a small `app_settings`
   single-row table or a client cookie — decided in planning.

4. **Storage layer (AWS S3 via `aws4fetch`)**
   - Written objects: minted keyframe images (nano-banana output) and finished videos.
   - Key convention: `sessions/{sessionId}/clips/{clipId}.mp4`,
     `sessions/{sessionId}/clips/{clipId}.png` (keyframe), `characters/{characterId}.png`.
   - Postgres stores only S3 keys; the client receives a presigned GET URL to play/show.
   - Delivery: presigned S3 GET URLs minted by the server (`aws4fetch` sign), short TTL.

### Data flow (happy path, story mode)

```
login (cookie set)
  → client POST /api/plan { brief }               → makePlan() → insert sessions row → { sessionId, plan }
  → for each missing character:
      client POST /api/generate/asset {kind:'character', ...}  → enqueue nano-banana → { requestId }
      client polls GET /api/status/:requestId      → done → image to S3 → character_library row done
  → for each scene:
      client POST /api/generate/asset {kind:'scene', sceneId, ...} → enqueue keyframe+video → { requestId }
      client polls GET /api/status/:requestId      → done → video to S3 → clips row done + video_key
  → client plays each video from its presigned S3 URL
```
Biography mode is identical with `makeBioPlan` / stage portraits / silent shots.

### Frontend changes

- Port the React 19 / Tailwind v4 / zustand UI into the Next.js App Router app as
  client components. No visual/UX change.
- `src/services/fal/*` direct calls are removed from the client. The store's
  `runStudio()` and `regenScene()` are rewired to call `/api/plan`,
  `/api/generate/asset`, and poll `/api/status/:requestId`, mapping results into the
  existing per-clip `status`/`phase`/`currentStep`/toast updates. The
  `GenerateCallbacks` seam is preserved conceptually — the store now fills the same
  fields from HTTP responses instead of in-process callbacks.
- The store's localStorage session/character CRUD is replaced by `/api/sessions` and
  `/api/characters` calls; hydration on load fetches from the server.
- `KeyBubble` (BYOK fal-key entry via `validateKey`/`storeKey`) is replaced by a login
  screen posting to `/api/login`; `SettingsDialog` loses the key field and keeps
  model/videoModel pickers.

## Error handling

- `mapFalError()` continues to translate fal errors into `FriendlyError`, now on the
  server; the API returns `{ error: FriendlyError }` and the client surfaces it through
  the existing toast path (unchanged `Toast` shape).
- Auth failures return 401; the client redirects to the login screen.
- A `clips` / `character_library` row transitions to `status='error'` with an `error`
  message when a fal job fails terminally (`fal.queue.status` → `FAILED` or fetch
  error); the client shows it per clip via the existing `onError` scope convention
  (`scene:<id>` vs other).

## Environment variables

```
APP_PASSWORD_HASH     # bcrypt/scrypt hash of the shared password
SESSION_SECRET        # HMAC secret for the JWT cookie
FAL_KEY               # org-wide fal.ai key
SUPABASE_URL
SUPABASE_SERVICE_KEY  # service-role key (server-only)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
S3_BUCKET
S3_REGION
```

## Constraints carried over from the current app

- Video models (`VIDEO_MODELS` in `fal/client.ts`): veo3.1 & veo3.1-fast (audio, 8s
  duration enum `"8s"`), seedance-2.0 & seedance-2.0-fast (audio, numeric duration
  string; default model `bytedance/seedance-2.0/image-to-video`), kling v3 pro (silent,
  ≤15s, uses `start_image_url`, no resolution). The per-model `buildVideoInput` logic
  must be preserved when moving server-side.
- LLM planner via `openrouter/router`; `MODELS` list + `DEFAULT_MODEL =
  'anthropic/claude-sonnet-4.5'`; `makePlan`/`makeBioPlan` use `maxTokens 8000`,
  temp 0.7, and retry once on JSON parse failure.
- `guide.ts` prompt contract must stay intact — `parsePlan`/`parseBioPlan` depend on a
  single JSON object matching `Plan` / `BiographyPlan`.
- `TIMEOUTS = { llm: 120_000, image: 180_000, video: 600_000 }` inform status-poll
  timeouts; the 10-minute video ceiling is the reason for the queue-based flow.

## Open questions to resolve during planning

- LLM-model selection persistence: a single-row `app_settings` table vs a client cookie.
- Whether `/api/generate/asset` enqueues keyframe and video as two separate fal jobs
  (two `request_id`s, two status rows) or the server chains keyframe→video inside one
  status-poll cycle. Leaning: chain server-side per status poll to keep the client
  simple (client sees one `request_id` per clip).
- Presigned-URL TTL and whether to add a thin `/api/media/:key` fallback proxy.
