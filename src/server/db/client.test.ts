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
