import { describe, it, expect } from 'vitest'
import { buildVideoPrompt } from './video'
import type { Scene } from '@/lib/types'

const scene: Scene = {
  id: '1',
  title: 'Meet',
  speakers: ['Rio', 'Bo'],
  visual: 'Rio waves at Bo in a sunny park, wide shot',
  dialogue: 'Rio: "Hi Bo!" Bo: "Hello Rio."',
}
const voices = new Map([
  ['rio', 'bright high energetic girl'],
  ['bo', 'deep calm synthetic'],
])

describe('buildVideoPrompt', () => {
  it('for audio models includes visual, dialogue, and per-speaker voice descriptions', () => {
    const p = buildVideoPrompt(scene, voices, true)
    expect(p).toContain('sunny park')
    expect(p).toContain('Hi Bo')
    expect(p).toContain('bright high energetic girl')
    expect(p).toContain('deep calm synthetic')
  })

  it('for silent models includes the visual but omits dialogue lines', () => {
    const p = buildVideoPrompt(scene, voices, false)
    expect(p).toContain('sunny park')
    expect(p).not.toContain('Hi Bo')
  })
})
