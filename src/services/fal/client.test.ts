import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    storage: { upload: vi.fn() },
  },
}))

import { fal } from '@fal-ai/client'
import { nanoBanana, klingVideo, ENDPOINTS } from './client'

const subscribe = fal.subscribe as ReturnType<typeof vi.fn>

beforeEach(() => subscribe.mockReset())

describe('nanoBanana', () => {
  it('uses the base endpoint and returns the first image url', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://img/1' }] }, requestId: 'r' })
    const r = await nanoBanana({ prompt: 'a cat', aspectRatio: '1:1' })
    expect(r.url).toBe('https://img/1')
    const [endpoint, cfg] = subscribe.mock.calls[0]
    expect(endpoint).toBe(ENDPOINTS.nanoBanana)
    expect(cfg.input).toMatchObject({ prompt: 'a cat', aspect_ratio: '1:1' })
    expect(cfg.input.image_urls).toBeUndefined()
  })

  it('uses the edit endpoint and passes image_urls when references are given', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://img/2' }] }, requestId: 'r' })
    await nanoBanana({ prompt: 'scene', imageUrls: ['https://a', 'https://b'] })
    const [endpoint, cfg] = subscribe.mock.calls[0]
    expect(endpoint).toBe(ENDPOINTS.nanoBananaEdit)
    expect(cfg.input.image_urls).toEqual(['https://a', 'https://b'])
  })

  it('throws when no image is returned', async () => {
    subscribe.mockResolvedValue({ data: { images: [] }, requestId: 'r' })
    await expect(nanoBanana({ prompt: 'x' })).rejects.toThrow(/no image/i)
  })
})

describe('klingVideo', () => {
  it('clamps duration to [3,15], disables audio, maps elements (max 3)', async () => {
    subscribe.mockResolvedValue({ data: { video: { url: 'https://v/1' } }, requestId: 'r' })
    const r = await klingVideo({
      prompt: '@Element1 waves',
      startImageUrl: 'https://key',
      durationSec: 99,
      elements: [
        { frontal_image_url: 'https://a' },
        { frontal_image_url: 'https://b' },
        { frontal_image_url: 'https://c' },
        { frontal_image_url: 'https://d' },
      ],
    })
    expect(r.url).toBe('https://v/1')
    const [endpoint, cfg] = subscribe.mock.calls[0]
    expect(endpoint).toBe(ENDPOINTS.klingVideo)
    expect(cfg.input).toMatchObject({
      prompt: '@Element1 waves',
      start_image_url: 'https://key',
      duration: '15',
      generate_audio: false,
    })
    expect(cfg.input.elements).toHaveLength(3)
  })

  it('omits elements when none are given', async () => {
    subscribe.mockResolvedValue({ data: { video: { url: 'https://v/2' } }, requestId: 'r' })
    await klingVideo({ prompt: 'empty room', startImageUrl: 'https://key', durationSec: 2 })
    const cfg = subscribe.mock.calls[0][1]
    expect(cfg.input.elements).toBeUndefined()
    expect(cfg.input.duration).toBe('3') // clamped up to min 3
  })
})
