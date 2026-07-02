import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    storage: { upload: vi.fn() },
  },
}))

import { fal } from '@fal-ai/client'
import {
  nanoBanana,
  run,
  TimeoutError,
  ENDPOINTS,
  VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  getVideoModel,
  buildVideoInput,
} from './client'

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

describe('run timeout/abort', () => {
  it('passes an abortSignal to subscribe', async () => {
    subscribe.mockResolvedValue({ data: {}, requestId: 'r' })
    await run('ep', {})
    const cfg = subscribe.mock.calls[0][1]
    expect(cfg.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('rejects with TimeoutError when the request exceeds timeoutMs', async () => {
    vi.useFakeTimers()
    // Mimic the real client: hang until the abortSignal fires, then reject.
    // (vitest may invoke the mock once more during cleanup with no config — settle those.)
    subscribe.mockImplementation((_ep: string, cfg?: { abortSignal: AbortSignal }) => {
      if (!cfg?.abortSignal) return Promise.resolve({ data: {}, requestId: 'cleanup' })
      return new Promise((_resolve, reject) => {
        cfg.abortSignal.addEventListener('abort', () => reject(new Error('The operation was aborted')))
      })
    })
    const p = run('ep', {}, { timeoutMs: 1000 })
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
    vi.useRealTimers()
  })

  it('aborts (without wrapping as TimeoutError) when an external signal fires', async () => {
    const ext = new AbortController()
    subscribe.mockImplementation((_ep: string, cfg?: { abortSignal: AbortSignal }) => {
      if (!cfg?.abortSignal) return Promise.resolve({ data: {}, requestId: 'cleanup' })
      return new Promise((_resolve, reject) => {
        cfg.abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const p = run('ep', {}, { signal: ext.signal })
    ext.abort()
    await expect(p).rejects.toThrow(/aborted/i)
  })
})

describe('VIDEO_MODELS', () => {
  it('has the five expected tiers with positive prices and durations', () => {
    const ids = VIDEO_MODELS.map((m) => m.id)
    expect(ids).toEqual([
      'fal-ai/veo3.1/image-to-video',
      'fal-ai/veo3.1/fast/image-to-video',
      'bytedance/seedance-2.0/image-to-video',
      'bytedance/seedance-2.0/fast/image-to-video',
      'fal-ai/kling-video/v3/pro/image-to-video',
    ])
    for (const m of VIDEO_MODELS) {
      expect(m.pricePerSec).toBeGreaterThan(0)
      expect(m.maxDurationSec).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  it('marks veo + seedance as audio and kling as silent', () => {
    expect(getVideoModel('fal-ai/veo3.1/image-to-video').audio).toBe(true)
    expect(getVideoModel('bytedance/seedance-2.0/fast/image-to-video').audio).toBe(true)
    expect(getVideoModel('fal-ai/kling-video/v3/pro/image-to-video').audio).toBe(false)
  })

  it('DEFAULT_VIDEO_MODEL is a known id', () => {
    expect(VIDEO_MODELS.some((m) => m.id === DEFAULT_VIDEO_MODEL)).toBe(true)
  })
})

describe('buildVideoInput', () => {
  const seedance = getVideoModel('bytedance/seedance-2.0/image-to-video')
  const kling = getVideoModel('fal-ai/kling-video/v3/pro/image-to-video')

  it('clamps duration to the model max and passes the start image + prompt', () => {
    const input = buildVideoInput(seedance, { prompt: 'hi', startImageUrl: 'u', durationSec: 999, aspect: 'landscape' })
    expect(input.prompt).toBe('hi')
    expect(input.image_url).toBe('u')
    expect(Number(input.duration)).toBeLessThanOrEqual(seedance.maxDurationSec)
  })

  it('requests audio only for audio-capable models', () => {
    expect(buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u' }).generate_audio).toBe(true)
    expect(buildVideoInput(kling, { prompt: 'p', startImageUrl: 'u' }).generate_audio).toBe(false)
  })

  it('maps portrait/landscape to the model aspect value', () => {
    const l = buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u', aspect: 'landscape' })
    const p = buildVideoInput(seedance, { prompt: 'p', startImageUrl: 'u', aspect: 'portrait' })
    expect(l.aspect_ratio).toBe(seedance.aspectRatios.landscape)
    expect(p.aspect_ratio).toBe(seedance.aspectRatios.portrait)
  })
})
