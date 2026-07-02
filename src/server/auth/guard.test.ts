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
