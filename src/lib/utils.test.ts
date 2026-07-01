import { describe, it, expect } from 'vitest'
import { sessionTitle } from './utils'

describe('sessionTitle', () => {
  it('returns Untitled for empty/whitespace', () => {
    expect(sessionTitle('   ')).toBe('Untitled')
  })
  it('collapses whitespace and keeps short titles', () => {
    expect(sessionTitle('  a  rainy   day ')).toBe('a rainy day')
  })
  it('truncates long titles with an ellipsis', () => {
    const out = sessionTitle('x'.repeat(60))
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out.endsWith('…')).toBe(true)
  })
})
