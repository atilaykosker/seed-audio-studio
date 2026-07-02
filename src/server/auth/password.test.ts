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
