import { describe, it, expect } from 'vitest'
import { estimatePlanCost } from './cost'
import type { Plan } from './types'

const plan: Plan = {
  category: 'Podcast',
  characters: [
    { name: 'A', voiceSpec: '', refPrompt: 'x' },
    { name: 'B', voiceSpec: '', refPrompt: 'y' },
  ],
  scenes: [
    { id: '1', kind: 'T2A', title: 's1', speakers: [], prompt: 'p' },
    { id: '2', kind: 'T2A', title: 's2', speakers: [], prompt: 'p' },
  ],
}

describe('estimatePlanCost', () => {
  it('matches the audio-only estimate when withVideo is false', () => {
    // 2 chars * 25s mint + 2 scenes * 40s = 130s -> 130/60 * 0.1875
    expect(estimatePlanCost(plan, 40)).toBeCloseTo((130 / 60) * 0.1875, 5)
  })

  it('adds nano-banana (per char + per scene) and kling seconds when withVideo', () => {
    const audio = (130 / 60) * 0.1875
    const images = (2 + 2) * 0.039 // 2 char images + 2 scene keyframes
    const video = 2 * 10 * 0.112 // 2 scenes * 10s * $/s
    expect(estimatePlanCost(plan, 40, true)).toBeCloseTo(audio + images + video, 5)
  })
})
