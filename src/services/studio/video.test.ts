import { describe, it, expect, vi, beforeEach } from 'vitest'

const { klingVideo } = vi.hoisted(() => {
  return { klingVideo: vi.fn() }
})

vi.mock('@/services/fal/client', () => ({ klingVideo }))

import { generateSceneVideo } from './video'
import type { Scene } from '@/lib/types'

beforeEach(() => klingVideo.mockReset())

const scene: Scene = { id: '1', kind: 'TA2A', title: 't', speakers: ['A', 'B'], prompt: 'p', visual: '@Element1 and @Element2 talk' }

describe('generateSceneVideo', () => {
  it('maps present character images to elements in order and passes visual as prompt', async () => {
    klingVideo.mockResolvedValue({ url: 'https://v/1' })
    const r = await generateSceneVideo(scene, 'https://key', ['https://a', 'https://b'], 12)
    expect(r.url).toBe('https://v/1')
    const [args] = klingVideo.mock.calls[0]
    expect(args).toMatchObject({ prompt: '@Element1 and @Element2 talk', startImageUrl: 'https://key', durationSec: 12 })
    expect(args.elements).toEqual([{ frontal_image_url: 'https://a' }, { frontal_image_url: 'https://b' }])
  })

  it('falls back to the audio prompt when visual is absent and sends no elements for narrator', async () => {
    klingVideo.mockResolvedValue({ url: 'https://v/2' })
    const narrator: Scene = { id: '2', kind: 'T2A', title: 't', speakers: [], prompt: 'the storm rolls in' }
    await generateSceneVideo(narrator, 'https://key', [], 8)
    const [args] = klingVideo.mock.calls[0]
    expect(args.prompt).toBe('the storm rolls in')
    expect(args.elements).toEqual([])
  })
})
