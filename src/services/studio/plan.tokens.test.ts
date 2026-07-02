import { describe, it, expect, vi } from 'vitest'
import type { Brief } from '@/lib/types'

// Capture the args passed to llmText without hitting the network.
const { llmText } = vi.hoisted(() => ({ llmText: vi.fn() }))
vi.mock('@/services/fal/client', () => ({ llmText }))

import { makeBioPlan, makePlan } from './plan'

const BIO_RESPONSE = JSON.stringify({
  subject: 'Ada',
  style: 's',
  stages: [{ label: 'adult', appearance: 'a' }],
  pages: [{ narration: 'n', shots: [{ stage: 'adult', visual: 'v' }] }],
})
const STORY_RESPONSE = JSON.stringify({
  category: 'Cartoon',
  characters: [{ name: 'A', appearance: 'a', voice: 'v' }],
  scenes: [{ title: 'S', speakers: ['A'], visual: 'v', dialogue: 'd' }],
})

const bioBrief: Brief = {
  idea: 'Ada Lovelace',
  durationSec: 40,
  language: 'EN',
  speakers: 'auto',
  genre: '',
  aspect: 'landscape',
  type: 'biography',
  shotSec: 8,
}
const storyBrief: Brief = { ...bioBrief, type: 'story' }

// Regression: a 3500-token cap truncated long biography plans mid-array, so the
// returned JSON failed to parse ("Expected ',' or ']' after array element").
describe('planner token budget', () => {
  it('makeBioPlan requests a large enough maxTokens to avoid truncating long biographies', async () => {
    llmText.mockReset()
    llmText.mockResolvedValueOnce(BIO_RESPONSE)
    await makeBioPlan(bioBrief, 'some-model')
    expect(llmText.mock.calls[0][0].maxTokens).toBeGreaterThanOrEqual(8000)
  })

  it('makePlan requests the same large maxTokens (long stories truncate too)', async () => {
    llmText.mockReset()
    llmText.mockResolvedValueOnce(STORY_RESPONSE)
    await makePlan(storyBrief, 'some-model')
    expect(llmText.mock.calls[0][0].maxTokens).toBeGreaterThanOrEqual(8000)
  })
})
