// @vitest-environment node
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
