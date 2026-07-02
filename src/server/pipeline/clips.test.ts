import { describe, it, expect } from 'vitest'
import { planToClips, bioPlanToClips } from './clips'
import type { Plan, BiographyPlan } from '../../lib/types'

describe('planToClips', () => {
  it('makes one pending clip per scene with visual+dialogue prompt', () => {
    const plan: Plan = { category: 'Drama', characters: [], scenes: [
      { id: 's1', title: 'Open', speakers: ['A'], visual: 'a room', dialogue: 'Hello' },
    ] }
    const clips = planToClips(plan)
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ sceneId: 's1', title: 'Open', speakers: ['A'], prompt: 'a room\nHello', status: 'pending' })
    expect(clips[0].id).toBeTruthy()
  })

  it('joins visual+dialogue with filter(Boolean) parity to the store (no stray newline on empty dialogue)', () => {
    const plan: Plan = { category: 'Drama', characters: [], scenes: [
      { id: 's1', title: 'Silent', speakers: ['A'], visual: 'a room', dialogue: '' },
      { id: 's2', title: 'Talk', speakers: ['A'], visual: 'a room', dialogue: 'Hello' },
    ] }
    const clips = planToClips(plan)
    expect(clips[0].prompt).toBe('a room')
    expect(clips[1].prompt).toBe('a room\nHello')
  })
})

describe('bioPlanToClips', () => {
  it('makes one pending clip per shot titled Page N · Shot M with visual prompt', () => {
    const bio: BiographyPlan = { subject: 'Ada', style: 'watercolor', stages: [], pages: [
      { id: 'p1', index: 1, narration: 'n', shots: [{ id: 'sh1', visual: 'a desk' }, { id: 'sh2', visual: 'a lamp' }] },
    ] }
    const clips = bioPlanToClips(bio)
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({ sceneId: 'sh1', title: 'Page 1 · Shot 1', speakers: [], prompt: 'a desk', status: 'pending' })
    expect(clips[1]).toMatchObject({ sceneId: 'sh2', title: 'Page 1 · Shot 2', status: 'pending' })
  })
})
