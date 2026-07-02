import { describe, it, expect } from 'vitest'
import { estimatePlanCost, clipCost, formatUSD, estimateBioCost } from './cost'
import { getVideoModel } from '@/services/fal/client'
import type { Plan, BiographyPlan } from './types'

const plan: Plan = {
  category: 'Cartoon',
  characters: [{ name: 'Rio', appearance: 'girl', voice: 'bright' }],
  scenes: [
    { id: 's1', title: 'A', speakers: ['Rio'], visual: 'v', dialogue: 'd' },
    { id: 's2', title: 'B', speakers: [], visual: 'v', dialogue: '' },
  ],
}

describe('cost', () => {
  it('clipCost = price/sec * duration for the model', () => {
    const m = getVideoModel('bytedance/seedance-2.0/image-to-video')
    expect(clipCost(m.id, 8)).toBeCloseTo(m.pricePerSec * 8, 5)
  })

  it('estimatePlanCost = images + shots * shotSec * price/sec', () => {
    const m = getVideoModel('fal-ai/veo3.1/image-to-video')
    const est = estimatePlanCost(plan, m.id, 8)
    const IMAGE_EACH = 0.039
    const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
    const video = plan.scenes.length * 8 * m.pricePerSec
    expect(est).toBeCloseTo(images + video, 5)
  })

  it('formatUSD floors tiny values', () => {
    expect(formatUSD(0.004)).toBe('<$0.01')
    expect(formatUSD(1.5)).toBe('$1.50')
  })
})

const bioPlan: BiographyPlan = {
  subject: 'Ada',
  style: 's',
  stages: [
    { id: 'a', label: 'child', appearance: 'x' },
    { id: 'b', label: 'adult', appearance: 'y' },
  ],
  pages: [
    { id: 'p1', index: 1, narration: 'n', shots: [{ id: 's1', visual: 'v' }, { id: 's2', visual: 'v' }] },
    { id: 'p2', index: 2, narration: 'n', shots: [{ id: 's3', visual: 'v' }] },
  ],
}

describe('estimateBioCost', () => {
  it('= stages*IMAGE_EACH + totalShots*shotSec*pricePerSec', () => {
    const m = getVideoModel('fal-ai/veo3.1/image-to-video')
    const est = estimateBioCost(bioPlan, m.id, 6)
    const IMAGE_EACH = 0.039
    const images = 2 * IMAGE_EACH // 2 stages
    const video = 3 * 6 * m.pricePerSec // 3 shots
    expect(est).toBeCloseTo(images + video, 5)
  })
})
