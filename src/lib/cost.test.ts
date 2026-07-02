import { describe, it, expect } from 'vitest'
import { estimatePlanCost, clipCost, formatUSD } from './cost'
import { getVideoModel } from '@/services/fal/client'
import type { Plan } from './types'

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
