// src/server/auth/session.test.ts
// @vitest-environment node
//
// jose's SignJWT does a strict `instanceof Uint8Array` check on its internally
// encoded JWT payload. Under Vitest's default jsdom environment, Node's native
// TextEncoder produces Uint8Array instances from a different realm than
// jsdom's global Uint8Array, so that check fails with
// "payload must be an instance of Uint8Array" even though the code is
// correct. This server-only module has no DOM dependency, so it's run in the
// plain Node environment (matching where it actually runs — Cloudflare
// Workers' Web Crypto — more closely than jsdom anyway).
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
