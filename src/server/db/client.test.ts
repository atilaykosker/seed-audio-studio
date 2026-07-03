import { describe, it, expect } from 'vitest'
import { getSupabase } from './client'

describe('getSupabase (deprecated stub)', () => {
  it('always throws — Supabase removed in favor of Cloudflare D1 (getDb)', () => {
    expect(() => getSupabase()).toThrow(/getDb/)
  })
})
