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
  klingVideo,
  seedAudio,
  clampPrompt,
  stripInvalidElementRefs,
  run,
  TimeoutError,
  ENDPOINTS,
  SEED_AUDIO_MAX_PROMPT,
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
    // kling requires reference_image_urls alongside frontal_image_url — default to the frontal.
    expect(cfg.input.elements[0]).toEqual({ frontal_image_url: 'https://a', reference_image_urls: ['https://a'] })
  })

  it('omits elements when none are given', async () => {
    subscribe.mockResolvedValue({ data: { video: { url: 'https://v/2' } }, requestId: 'r' })
    await klingVideo({ prompt: 'empty room', startImageUrl: 'https://key', durationSec: 2 })
    const cfg = subscribe.mock.calls[0][1]
    expect(cfg.input.elements).toBeUndefined()
    expect(cfg.input.duration).toBe('3') // clamped up to min 3
  })

  it('strips @ElementN from the prompt when no elements are provided', async () => {
    subscribe.mockResolvedValue({ data: { video: { url: 'https://v/3' } }, requestId: 'r' })
    await klingVideo({ prompt: '@Element1 and @Element2 chat in the rain', startImageUrl: 'https://key' })
    const cfg = subscribe.mock.calls[0][1]
    expect(cfg.input.prompt).not.toMatch(/@Element/)
    expect(cfg.input.elements).toBeUndefined()
  })
})

describe('stripInvalidElementRefs', () => {
  it('removes refs beyond the element count', () => {
    expect(stripInvalidElementRefs('@Element1 and @Element2 talk', 1)).toBe('@Element1 and talk')
  })
  it('strips every ref when zero elements', () => {
    expect(stripInvalidElementRefs('@Element1 waves at @Element2', 0)).toBe('waves at')
  })
  it('keeps refs within range', () => {
    expect(stripInvalidElementRefs('@Element1 and @Element2', 2)).toBe('@Element1 and @Element2')
  })
})

describe('clampPrompt', () => {
  it('leaves a short prompt untouched', () => {
    expect(clampPrompt('hello', 2048)).toBe('hello')
  })

  it('never exceeds the max length', () => {
    const long = 'word '.repeat(1000) // 5000 chars
    expect(clampPrompt(long, SEED_AUDIO_MAX_PROMPT).length).toBeLessThanOrEqual(SEED_AUDIO_MAX_PROMPT)
  })

  it('prefers a sentence boundary when one is available', () => {
    const p = 'A'.repeat(1990) + '. ' + 'B'.repeat(200) // sentence end near 1992
    const out = clampPrompt(p, 2048)
    expect(out.endsWith('.')).toBe(true)
    expect(out).not.toContain('B')
  })
})

describe('seedAudio prompt clamping', () => {
  it('sends a prompt no longer than the 2048-char limit', async () => {
    subscribe.mockResolvedValue({ data: { audio: { url: 'https://a', duration: 5 } }, requestId: 'r' })
    await seedAudio({ prompt: 'x '.repeat(2000) }) // 4000 chars
    const cfg = subscribe.mock.calls[0][1]
    expect(cfg.input.prompt.length).toBeLessThanOrEqual(SEED_AUDIO_MAX_PROMPT)
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
