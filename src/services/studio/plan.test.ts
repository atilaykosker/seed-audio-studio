import { describe, it, expect } from 'vitest'
import { parsePlan, buildPlanPrompt } from './plan'
import type { Brief } from '@/lib/types'

const brief = (over: Partial<Brief> = {}): Brief => ({
  idea: 'two friends chat',
  durationSec: 40,
  language: 'EN',
  speakers: 'auto',
  genre: '',
  voiceIds: [],
  withVideo: false,
  ...over,
})

describe('parsePlan', () => {
  it('parses a legacy audio-only plan (no appearance/visual)', () => {
    const p = parsePlan(
      JSON.stringify({
        category: 'Podcast',
        characters: [{ name: 'A', voiceSpec: 'warm', refPrompt: 'ref' }],
        scenes: [{ kind: 'T2A', title: 's', speakers: [], prompt: 'p' }],
      }),
    )
    expect(p.characters[0].appearance).toBeUndefined()
    expect(p.scenes[0].visual).toBeUndefined()
  })

  it('parses appearance and visual when present', () => {
    const p = parsePlan(
      JSON.stringify({
        category: 'Drama',
        characters: [{ name: 'A', voiceSpec: 'warm', refPrompt: 'ref', appearance: 'tall, red coat' }],
        scenes: [{ kind: 'TA2A', title: 's', speakers: ['A'], prompt: 'p', visual: 'wide dolly-in' }],
      }),
    )
    expect(p.characters[0].appearance).toBe('tall, red coat')
    expect(p.scenes[0].visual).toBe('wide dolly-in')
  })
})

describe('buildPlanPrompt', () => {
  it('omits the video directive in audio-only mode', () => {
    expect(buildPlanPrompt(brief())).not.toMatch(/15 seconds/i)
  })
  it('includes the ≤15s video directive in video mode', () => {
    expect(buildPlanPrompt(brief({ withVideo: true }))).toMatch(/15 seconds/i)
  })
})
