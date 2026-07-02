import { describe, it, expect } from 'vitest'
import { parsePlan, buildPlanPrompt } from './plan'
import type { Brief } from '@/lib/types'

const RAW = JSON.stringify({
  category: 'Cartoon',
  characters: [
    { name: 'Rio', appearance: 'young girl, red hoodie, cartoon style', voice: 'bright high energetic' },
    { name: 'Bo', appearance: 'blue robot, round eyes', voice: 'deep calm synthetic' },
  ],
  scenes: [
    { title: 'Meet', speakers: ['Rio', 'Bo'], visual: 'Rio waves at Bo in a sunny park, wide shot', dialogue: 'Rio: "Hi Bo!" Bo: "Hello Rio."' },
    { title: 'Sky', speakers: [], visual: 'Clouds drift over the park, no characters', dialogue: '' },
  ],
})

describe('parsePlan', () => {
  it('parses characters (appearance+voice) and scenes (visual+dialogue)', () => {
    const p = parsePlan('```json\n' + RAW + '\n```')
    expect(p.category).toBe('Cartoon')
    expect(p.characters.map((c) => c.name)).toEqual(['Rio', 'Bo'])
    expect(p.characters[0].appearance).toContain('hoodie')
    expect(p.characters[0].voice).toBe('bright high energetic')
    expect(p.scenes).toHaveLength(2)
    expect(p.scenes[0].speakers).toEqual(['Rio', 'Bo'])
    expect(p.scenes[0].visual).toContain('park')
    expect(p.scenes[0].dialogue).toContain('Hi Bo')
    expect(p.scenes[1].dialogue).toBe('')
    expect(p.scenes[0].id).toBeTruthy()
  })

  it('drops characters without a name and caps speakers at 3', () => {
    const raw = JSON.stringify({
      characters: [{ appearance: 'x', voice: 'y' }, { name: 'A', appearance: 'a', voice: 'v' }],
      scenes: [{ title: 'S', speakers: ['A', 'B', 'C', 'D'], visual: 'v', dialogue: 'd' }],
    })
    const p = parsePlan(raw)
    expect(p.characters.map((c) => c.name)).toEqual(['A'])
    expect(p.scenes[0].speakers).toHaveLength(3)
  })

  it('throws when scenes are missing', () => {
    expect(() => parsePlan(JSON.stringify({ characters: [] }))).toThrow()
  })
})

describe('buildPlanPrompt', () => {
  it('includes the idea, target length and aspect', () => {
    const b: Brief = { idea: 'a fox finds a lamp', durationSec: 24, language: 'EN', speakers: 'auto', genre: '', aspect: 'portrait' }
    const out = buildPlanPrompt(b)
    expect(out).toContain('a fox finds a lamp')
    expect(out).toContain('24')
    expect(out.toLowerCase()).toContain('portrait')
  })
})
