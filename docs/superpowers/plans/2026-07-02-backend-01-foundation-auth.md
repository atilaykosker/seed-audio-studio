# Backend Migration — Plan 1: Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js App Router app that deploys to Cloudflare Workers and is gated by a single shared password (JWT cookie), coexisting with the current Vite app until the final cutover plan.

**Architecture:** Add a Next.js App Router surface (`app/`) alongside the existing Vite `src/` in the same repo. Auth is a custom PBKDF2 password check + a `jose` HS256 JWT stored in an HttpOnly cookie; a `middleware.ts` gates all pages and `/api/*` routes except the login endpoints. All auth crypto uses Web Crypto / `jose` so it runs unchanged on Workers.

**Tech Stack:** Next.js 15 (App Router), `@opennextjs/cloudflare`, `wrangler`, `jose`, Web Crypto (PBKDF2), Tailwind v4 (`@tailwindcss/postcss`), Vitest.

## Global Constraints

- Runtime target: Cloudflare Workers with `nodejs_compat` — no Node-only native modules (no `bcrypt`); auth crypto must use Web Crypto or `jose`.
- Do NOT break the existing Vite app: `src/`, `index.html`, `vite.config.ts`, and the `dev`/`build` (vite) scripts keep working through Plans 1–4. Next.js lives in `app/` with its own scripts.
- Package manager is **pnpm**. React is v19 (shared by both apps).
- Path alias `@/` → repo root `src/` already exists for Vite; Next uses its own `@/*` → repo root via `tsconfig` paths — keep them from colliding (see Task 1).
- Secrets come from env only. Never commit real secret values. Local dev uses `.dev.vars` (gitignored); production uses `wrangler secret`.
- Every task ends green: `pnpm test:run` passes and (from Task 2 on) `pnpm next build` succeeds.

---

## File Structure

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` — Next App Router root + protected home placeholder.
- `app/login/page.tsx` — login screen (client component).
- `app/api/login/route.ts`, `app/api/logout/route.ts` — auth endpoints.
- `middleware.ts` — cookie gate for pages + `/api/*`.
- `src/server/auth/password.ts` — PBKDF2 hash/verify (Web Crypto). *(new `src/server/` tree = server-only code shared by route handlers)*
- `src/server/auth/session.ts` — `jose` JWT sign/verify + cookie name/const.
- `src/server/auth/guard.ts` — pure `isPublicPath()` / authorization decision used by middleware (unit-tested without a request).
- `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `postcss.config.mjs` — Next + Workers + Tailwind config.
- `tsconfig` additions and `.dev.vars.example`.
- Tests: `src/server/auth/*.test.ts`.

---

### Task 1: Scaffold Next.js App Router alongside Vite

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.ts`, `postcss.config.mjs`, `next-env.d.ts` (generated)
- Modify: `package.json` (scripts + deps), `tsconfig.app.json` or new `tsconfig.json` paths, `.gitignore`
- Test: none (scaffolding — verified by build/run commands)

**Interfaces:**
- Produces: a working `pnpm next dev` / `pnpm next build`; a Next `app/` tree with Tailwind v4 wired via `@tailwindcss/postcss`. Later tasks add routes/pages under `app/`.

- [ ] **Step 1: Install Next + Tailwind PostCSS deps**

```bash
pnpm add next@15 && pnpm add -D @tailwindcss/postcss postcss
```

- [ ] **Step 2: Add Next scripts to package.json** (keep the existing vite `dev`/`build`; add Next under distinct names)

In `package.json` `"scripts"`, add:
```json
"next:dev": "next dev",
"next:build": "next build",
"next:start": "next start"
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // App Router is default in Next 15. Keep the Vite src/ out of Next's page graph.
  pageExtensions: ['tsx', 'ts'],
}

export default nextConfig
```

- [ ] **Step 4: Create `postcss.config.mjs` for Tailwind v4**

```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
}
```

- [ ] **Step 5: Create `app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create `app/layout.tsx`**

```tsx
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Bookticle Studio' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Create `app/page.tsx` (temporary protected home placeholder)**

```tsx
export default function Home() {
  return <main className="p-8 text-lg">Bookticle Studio — authenticated.</main>
}
```

- [ ] **Step 8: Add Next paths + app dir to TypeScript without breaking Vite**

Create a root `tsconfig.json` that Next uses (Vite keeps `tsconfig.app.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "app/**/*", "middleware.ts", "src/server/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 9: Gitignore Next artifacts**

Append to `.gitignore`:
```
.next/
.open-next/
.dev.vars
.wrangler/
```

- [ ] **Step 10: Verify Next builds and runs**

Run: `pnpm next:build`
Expected: build completes; a route `/` is emitted. Then `pnpm next:dev` and confirm `http://localhost:3000` shows "Bookticle Studio — authenticated."

- [ ] **Step 11: Verify the Vite app still builds**

Run: `pnpm build`
Expected: the existing `tsc -b && vite build` still succeeds (no regression).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(next): scaffold Next.js App Router alongside Vite app"
```

---

### Task 2: Cloudflare Workers deploy target (`@opennextjs/cloudflare`)

**Files:**
- Create: `open-next.config.ts`, `wrangler.jsonc`, `.dev.vars.example`
- Modify: `package.json` (deploy/preview scripts)
- Test: none (config — verified by the OpenNext build command)

**Interfaces:**
- Produces: `pnpm cf:build` producing a Workers bundle under `.open-next/`; `wrangler` config declaring `nodejs_compat` and the env var names later tasks read.

- [ ] **Step 1: Install OpenNext + wrangler**

```bash
pnpm add @opennextjs/cloudflare && pnpm add -D wrangler
```

- [ ] **Step 2: Create `open-next.config.ts`**

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
```

- [ ] **Step 3: Create `wrangler.jsonc`**

```jsonc
{
  "name": "bookticle-studio",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-03-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "vars": {},
  // Secrets (APP_PASSWORD_HASH, SESSION_SECRET, FAL_KEY, SUPABASE_URL,
  // SUPABASE_SERVICE_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
  // S3_BUCKET, S3_REGION) are set via `wrangler secret put <NAME>`.
}
```

- [ ] **Step 4: Create `.dev.vars.example`** (developers copy to `.dev.vars`)

```
APP_PASSWORD_HASH=
SESSION_SECRET=
FAL_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_REGION=
```

- [ ] **Step 5: Add Cloudflare scripts to package.json**

```json
"cf:build": "opennextjs-cloudflare build",
"cf:preview": "opennextjs-cloudflare build && wrangler dev",
"cf:deploy": "opennextjs-cloudflare build && wrangler deploy"
```

- [ ] **Step 6: Verify the Workers bundle builds**

Run: `pnpm cf:build`
Expected: completes and writes `.open-next/worker.js`. (No deploy in this step.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cf): add @opennextjs/cloudflare Workers deploy target"
```

---

### Task 3: Password hashing (PBKDF2, Web Crypto)

**Files:**
- Create: `src/server/auth/password.ts`
- Test: `src/server/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string, saltHex?: string): Promise<string>` — returns `"<saltHex>:<derivedHex>"` (PBKDF2-SHA256, 100_000 iters, 32-byte key). Random salt when omitted.
  - `verifyPassword(password: string, stored: string): Promise<boolean>` — constant-time compare against a `"<salt>:<hash>"` string (the value of `APP_PASSWORD_HASH`).

- [ ] **Step 1: Write the failing test**

```ts
// src/server/auth/password.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('verifies a correct password against its own hash', async () => {
    const stored = await hashPassword('hunter2')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(await verifyPassword('hunter2', stored)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const stored = await hashPassword('hunter2')
    expect(await verifyPassword('wrong', stored)).toBe(false)
  })

  it('is deterministic for a fixed salt', async () => {
    const a = await hashPassword('pw', 'aabbccdd')
    const b = await hashPassword('pw', 'aabbccdd')
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/auth/password.test.ts`
Expected: FAIL — cannot find module `./password`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/auth/password.ts
const ITER = 100_000
const KEY_LEN = 32

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, KEY_LEN * 8)
  return toHex(bits)
}

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const saltStr = saltHex ?? toHex(salt.buffer)
  const hash = await derive(password, salt)
  return `${saltStr}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expected] = stored.split(':')
  if (!saltHex || !expected) return false
  const actual = await derive(password, fromHex(saltHex))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/auth/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/password.ts src/server/auth/password.test.ts
git commit -m "feat(auth): PBKDF2 password hash/verify (Web Crypto)"
```

---

### Task 4: Session JWT (jose) + cookie constants

**Files:**
- Create: `src/server/auth/session.ts`
- Test: `src/server/auth/session.test.ts`

**Interfaces:**
- Consumes: `SESSION_SECRET` (passed in, not read from env inside these fns, so tests are hermetic).
- Produces:
  - `SESSION_COOKIE = 'bookticle_session'`
  - `signSession(secret: string, ttlSeconds?: number): Promise<string>` — HS256 JWT with `sub: 'app'`, default 7-day expiry.
  - `verifySession(token: string, secret: string): Promise<boolean>` — true iff signature + expiry valid.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/auth/session.test.ts
import { describe, it, expect } from 'vitest'
import { signSession, verifySession, SESSION_COOKIE } from './session'

const SECRET = 'test-secret-at-least-32-chars-long-xx'

describe('session', () => {
  it('signs and verifies with the same secret', async () => {
    const token = await signSession(SECRET)
    expect(await verifySession(token, SECRET)).toBe(true)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(SECRET)
    expect(await verifySession(token, 'other-secret-also-32-chars-long-yyyy')).toBe(false)
  })

  it('rejects an expired token', async () => {
    const token = await signSession(SECRET, -10) // already expired
    expect(await verifySession(token, SECRET)).toBe(false)
  })

  it('exposes the cookie name', () => {
    expect(SESSION_COOKIE).toBe('bookticle_session')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/auth/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Install jose, then write minimal implementation**

```bash
pnpm add jose
```

```ts
// src/server/auth/session.ts
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'bookticle_session'
const DEFAULT_TTL = 60 * 60 * 24 * 7 // 7 days

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signSession(secret: string, ttlSeconds: number = DEFAULT_TTL): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: 'app' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key(secret))
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, key(secret))
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/auth/session.test.ts`
Expected: PASS (4 tests).

> Note: `signSession(SECRET, -10)` sets expiry in the past; `jwtVerify` throws `JWTExpired`, so `verifySession` returns false. `Date.now()` is available in Vitest (jsdom) and on Workers.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/session.ts src/server/auth/session.test.ts package.json
git commit -m "feat(auth): jose HS256 session sign/verify + cookie constant"
```

---

### Task 5: Route guard decision (pure) + middleware

**Files:**
- Create: `src/server/auth/guard.ts`, `middleware.ts`
- Test: `src/server/auth/guard.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE`, `verifySession` (Task 4).
- Produces:
  - `isPublicPath(pathname: string): boolean` — true for `/login`, `/api/login`, `/api/logout`, and Next static asset paths (`/_next/*`, `/favicon.ico`).
  - `middleware.ts` uses `isPublicPath` + `verifySession` to allow, redirect (pages → `/login`), or 401 (`/api/*`).

- [ ] **Step 1: Write the failing test**

```ts
// src/server/auth/guard.test.ts
import { describe, it, expect } from 'vitest'
import { isPublicPath } from './guard'

describe('isPublicPath', () => {
  it('allows login routes without a session', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/api/login')).toBe(true)
    expect(isPublicPath('/api/logout')).toBe(true)
  })
  it('allows Next static assets', () => {
    expect(isPublicPath('/_next/static/chunk.js')).toBe(true)
    expect(isPublicPath('/favicon.ico')).toBe(true)
  })
  it('protects app pages and api routes', () => {
    expect(isPublicPath('/')).toBe(false)
    expect(isPublicPath('/api/plan')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/auth/guard.test.ts`
Expected: FAIL — cannot find module `./guard`.

- [ ] **Step 3: Write minimal implementation of the guard**

```ts
// src/server/auth/guard.ts
const PUBLIC_EXACT = new Set(['/login', '/api/login', '/api/logout', '/favicon.ico'])

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (pathname.startsWith('/_next/')) return true
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/auth/guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `middleware.ts` (integration glue — exercised by the manual check in Task 6)**

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/src/server/auth/session'
import { isPublicPath } from '@/src/server/auth/guard'

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const secret = process.env.SESSION_SECRET ?? ''
  const ok = token ? await verifySession(token, secret) : false
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
```

> Import path note: `@/*` maps to repo root (Task 1 tsconfig), so `@/src/server/...` resolves. If the executing agent prefers a shorter alias, add `"@server/*": ["./src/server/*"]` to `tsconfig.json` paths and use it consistently.

- [ ] **Step 6: Verify guard tests still pass and Next still builds**

Run: `pnpm vitest run src/server/auth/guard.test.ts && pnpm next:build`
Expected: tests PASS; build succeeds with `middleware` compiled.

- [ ] **Step 7: Commit**

```bash
git add src/server/auth/guard.ts src/server/auth/guard.test.ts middleware.ts
git commit -m "feat(auth): route guard + middleware cookie gate"
```

---

### Task 6: Login / logout endpoints + login page

**Files:**
- Create: `app/api/login/route.ts`, `app/api/logout/route.ts`, `app/login/page.tsx`
- Test: `src/server/auth/login-handler.test.ts` (unit-test the handler's decision via a helper)
- Modify: `src/server/auth/session.ts` (add a cookie-serialization helper if desired — optional)

**Interfaces:**
- Consumes: `verifyPassword` (Task 3), `signSession` + `SESSION_COOKIE` (Task 4).
- Produces:
  - `POST /api/login` — body `{ password }`; on match sets the session cookie (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 7d) and returns `{ ok: true }`; on mismatch returns 401 `{ error: 'invalid' }`.
  - `POST /api/logout` — clears the cookie, returns `{ ok: true }`.
  - `attemptLogin(password: string, env: { APP_PASSWORD_HASH: string; SESSION_SECRET: string }): Promise<string | null>` — pure helper returning a signed token on success, `null` on failure. Route handler wraps it with cookie I/O.

- [ ] **Step 1: Write the failing test for the pure login helper**

```ts
// src/server/auth/login-handler.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword } from './password'
import { attemptLogin } from './login-handler'
import { verifySession } from './session'

const SECRET = 'test-secret-at-least-32-chars-long-xx'

describe('attemptLogin', () => {
  it('returns a valid session token for the correct password', async () => {
    const APP_PASSWORD_HASH = await hashPassword('letmein')
    const token = await attemptLogin('letmein', { APP_PASSWORD_HASH, SESSION_SECRET: SECRET })
    expect(token).toBeTypeOf('string')
    expect(await verifySession(token as string, SECRET)).toBe(true)
  })

  it('returns null for a wrong password', async () => {
    const APP_PASSWORD_HASH = await hashPassword('letmein')
    expect(await attemptLogin('nope', { APP_PASSWORD_HASH, SESSION_SECRET: SECRET })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/auth/login-handler.test.ts`
Expected: FAIL — cannot find module `./login-handler`.

- [ ] **Step 3: Write the pure helper**

```ts
// src/server/auth/login-handler.ts
import { verifyPassword } from './password'
import { signSession } from './session'

export async function attemptLogin(
  password: string,
  env: { APP_PASSWORD_HASH: string; SESSION_SECRET: string },
): Promise<string | null> {
  const ok = await verifyPassword(password, env.APP_PASSWORD_HASH)
  if (!ok) return null
  return signSession(env.SESSION_SECRET)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/auth/login-handler.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the route handlers**

```ts
// app/api/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { attemptLogin } from '@/src/server/auth/login-handler'
import { SESSION_COOKIE } from '@/src/server/auth/session'

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const token = password
    ? await attemptLogin(password, {
        APP_PASSWORD_HASH: process.env.APP_PASSWORD_HASH ?? '',
        SESSION_SECRET: process.env.SESSION_SECRET ?? '',
      })
    : null
  if (!token) return NextResponse.json({ error: 'invalid' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
```

```ts
// app/api/logout/route.ts
import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/src/server/auth/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
```

- [ ] **Step 6: Write the login page**

```tsx
// app/login/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setBusy(false)
    if (res.ok) router.replace('/')
    else setError('Incorrect password')
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Bookticle Studio</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border px-3 py-2"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Generate a real `APP_PASSWORD_HASH` for local dev**

Run a one-off to fill `.dev.vars` (copy from `.dev.vars.example` first):
```bash
pnpm vitest run -t "verifies a correct password" # sanity that crypto works
node --input-type=module -e "import('./src/server/auth/password.ts').then(async m => console.log(await m.hashPassword(process.argv[1])))" 'CHOSEN_DEV_PASSWORD'
```
Paste the printed `salt:hash` into `.dev.vars` as `APP_PASSWORD_HASH=...`, and set `SESSION_SECRET` to a 32+ char random string.
> If `node` cannot import the `.ts` directly in this repo, run the same call from a scratch `.mjs` that imports the compiled output, or use `pnpm tsx`. The value is just `salt:hash`.

- [ ] **Step 8: Manual end-to-end verification (auth gate)**

Run: `pnpm cf:preview` (Workers runtime with `.dev.vars` loaded) or `pnpm next:dev` with the vars exported.
Verify in a browser:
1. Visiting `/` while logged out → redirected to `/login`.
2. Wrong password → "Incorrect password", stays on `/login`.
3. Correct password → redirected to `/`, which shows "Bookticle Studio — authenticated."
4. `curl -i` a protected API path (e.g. `/api/plan`) without the cookie → `401`.

Record the observed outputs (screenshots or curl output) per superpowers:verification-before-completion.

- [ ] **Step 9: Commit**

```bash
git add app/api/login/route.ts app/api/logout/route.ts app/login/page.tsx src/server/auth/login-handler.ts src/server/auth/login-handler.test.ts
git commit -m "feat(auth): login/logout endpoints + login page"
```

---

## Self-Review

**Spec coverage (Plan 1 slice):**
- Single shared password login → Tasks 3–6. ✅
- JWT cookie signed with `SESSION_SECRET` → Task 4/6. ✅
- Middleware gates pages + `/api/*` except login → Task 5. ✅
- Next.js App Router on Cloudflare Workers w/ `nodejs_compat` → Tasks 1–2. ✅
- Env var names (`APP_PASSWORD_HASH`, `SESSION_SECRET`, plus placeholders for later plans) → Task 2 `.dev.vars.example` + `wrangler.jsonc`. ✅
- Worker-native crypto (no bcrypt) → Task 3 PBKDF2 via Web Crypto. ✅
- Coexistence with Vite app (no regression) → Task 1 Steps 11, keeps `src/`/vite scripts. ✅
- Deferred to later plans: `/api/plan`, `/api/generate`, `/api/status`, Supabase, S3, store rewire, UI port — correctly out of scope here.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The `.dev.vars` values are real generated secrets, not placeholders. ✅

**Type consistency:** `SESSION_COOKIE`, `signSession`/`verifySession`, `hashPassword`/`verifyPassword`, `attemptLogin`, `isPublicPath` names are used identically across tasks and in `middleware.ts` / route handlers. ✅

## Execution Handoff

This is Plan 1 of 5. Plans 2–5 (Data & Storage, Server pipeline API, Sessions & Characters API, Frontend port & cutover) are written after this one lands, each producing independently testable software.
