import { describe, it, expect, vi, beforeEach } from 'vitest'

const { klingVideo } = vi.hoisted(() => {
  return { klingVideo: vi.fn() }
})

vi.mock('@/services/fal/client', () => ({ klingVideo }))

import { generateSceneVideo, buildElementPrompt } from './video'
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

  it('drops an imageless narrator speaker and renumbers @ElementN for the visible characters', async () => {
    klingVideo.mockResolvedValue({ url: 'https://v/3' })
    // speakers [Narrator, Bunny, Rio]; narrator has no image → aligned array has a leading gap.
    const s: Scene = {
      id: '3',
      kind: 'TA2A',
      title: 't',
      speakers: ['Narrator', 'Bunny', 'Rio'],
      prompt: 'p',
      visual: '[rain] @Element2 looks sad while @Element3 flutters',
    }
    await generateSceneVideo(s, 'https://key', [undefined, 'https://bunny', 'https://rio'], 10)
    const [args] = klingVideo.mock.calls[0]
    expect(args.elements).toEqual([{ frontal_image_url: 'https://bunny' }, { frontal_image_url: 'https://rio' }])
    expect(args.prompt).toBe('[rain] @Element1 looks sad while @Element2 flutters')
  })
})

describe('buildElementPrompt', () => {
  it('renumbers refs and drops the imageless slot', () => {
    const r = buildElementPrompt('@Element1 narrates, @Element2 waves, @Element3 nods', [undefined, 'https://b', 'https://c'])
    expect(r.elements).toEqual([{ frontal_image_url: 'https://b' }, { frontal_image_url: 'https://c' }])
    // @Element1 (narrator, no image) removed; @Element2->1, @Element3->2
    expect(r.prompt).toBe('narrates, @Element1 waves, @Element2 nods')
  })

  it('returns no elements and strips all refs when nothing has an image', () => {
    const r = buildElementPrompt('@Element1 and @Element2 chat', [undefined, undefined])
    expect(r.elements).toEqual([])
    expect(r.prompt).not.toMatch(/@Element/)
  })
})
