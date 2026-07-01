import { describe, it, expect } from 'vitest'
import { mapFalError } from './errors'

describe('mapFalError timeout/abort', () => {
  it('maps a TimeoutError to a retryable network timeout message', () => {
    const err = new Error('Request timed out after 120s.')
    err.name = 'TimeoutError'
    const fe = mapFalError(err)
    expect(fe.kind).toBe('network')
    expect(fe.retryable).toBe(true)
    expect(fe.title).toMatch(/timed out/i)
  })

  it('maps an AbortError similarly', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    expect(mapFalError(err).title).toMatch(/timed out/i)
  })

  it('falls through to unknown for a plain error', () => {
    expect(mapFalError(new Error('boom')).kind).toBe('unknown')
  })
})
