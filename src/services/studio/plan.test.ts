import { describe, it, expect } from 'vitest'
import { parsePlan, buildPlanPrompt, parseBioPlan, buildBioPrompt } from './plan'
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
    const b: Brief = { idea: 'a fox finds a lamp', durationSec: 24, language: 'EN', speakers: 'auto', genre: '', aspect: 'portrait', type: 'story', shotSec: 8 }
    const out = buildPlanPrompt(b)
    expect(out).toContain('a fox finds a lamp')
    expect(out).toContain('24')
    expect(out.toLowerCase()).toContain('portrait')
  })
})

const RAW_BIO = JSON.stringify({
  subject: 'Ada Lovelace',
  style: 'painterly educational animation, cinematic camera, warm lighting',
  stages: [
    { label: 'child ~10', appearance: 'young girl, curls, early-1800s dress' },
    { label: 'adult', appearance: 'woman in Victorian gown, composed' },
  ],
  pages: [
    {
      narration: 'My name is Ada. I loved mathematics as a child.',
      shots: [
        { stage: 'child ~10', visual: 'A girl studies numbers by candlelight, close-up' },
        { stage: 'child ~10', visual: 'Wide shot of a grand study full of books' },
      ],
    },
    {
      narration: 'Later, I imagined machines that could compute.',
      shots: [{ stage: 'adult', visual: 'A woman sketches gears at a desk, medium shot' }],
    },
  ],
})

describe('parseBioPlan', () => {
  it('parses subject/style/stages and pages with shots, resolving stage ids', () => {
    const p = parseBioPlan('```json\n' + RAW_BIO + '\n```')
    expect(p.subject).toBe('Ada Lovelace')
    expect(p.style).toContain('painterly')
    expect(p.stages.map((s) => s.label)).toEqual(['child ~10', 'adult'])
    expect(p.stages[0].id).toBeTruthy()
    expect(p.pages).toHaveLength(2)
    expect(p.pages[0].index).toBe(1)
    expect(p.pages[1].index).toBe(2)
    expect(p.pages[0].shots).toHaveLength(2)
    // shot.stageId resolves to the matching stage's id (not the raw label)
    const childId = p.stages.find((s) => s.label === 'child ~10')!.id
    expect(p.pages[0].shots[0].stageId).toBe(childId)
    expect(p.pages[0].shots[0].visual).toContain('candlelight')
    expect(p.pages[0].shots[0].id).toBeTruthy()
  })

  it('drops shots without a visual, keeps a page only if it has shots, and throws when empty', () => {
    const raw = JSON.stringify({
      subject: 'X',
      style: 's',
      stages: [{ label: 'adult', appearance: 'a' }],
      pages: [
        { narration: 'n', shots: [{ stage: 'adult', visual: '' }, { stage: 'adult', visual: 'ok' }] },
        { narration: 'empty', shots: [{ stage: 'adult', visual: '' }] },
      ],
    })
    const p = parseBioPlan(raw)
    expect(p.pages).toHaveLength(1)
    expect(p.pages[0].shots).toHaveLength(1)
    expect(() => parseBioPlan(JSON.stringify({ subject: 'X', style: 's', stages: [], pages: [] }))).toThrow()
  })

  it('leaves stageId undefined for a shot with no/unknown stage', () => {
    const raw = JSON.stringify({
      subject: 'X',
      style: 's',
      stages: [{ label: 'adult', appearance: 'a' }],
      pages: [{ narration: 'n', shots: [{ visual: 'atmosphere only' }, { stage: 'ghost', visual: 'unknown stage' }] }],
    })
    const p = parseBioPlan(raw)
    expect(p.pages[0].shots[0].stageId).toBeUndefined()
    expect(p.pages[0].shots[1].stageId).toBeUndefined()
  })
})

describe('buildBioPrompt', () => {
  it('includes the subject, orientation and narration language, and NOT a target length', () => {
    const b: Brief = { idea: 'Ada Lovelace, pioneer of computing', durationSec: 40, language: 'EN', speakers: 'auto', genre: '', aspect: 'portrait', type: 'biography', shotSec: 6 }
    const out = buildBioPrompt(b)
    expect(out).toContain('Ada Lovelace')
    expect(out.toLowerCase()).toContain('portrait')
    expect(out).toContain('English')
    expect(out).not.toMatch(/target (total )?length/i)
  })
})
