import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/fal/client', () => ({
  nanoBanana: vi.fn()
}))

import { mintCharacterImage, sceneKeyframe, buildCharacterImagePrompt } from './image'
import { nanoBanana } from '@/services/fal/client'
import type { Character, Scene } from '@/lib/types'

beforeEach(() => nanoBanana.mockReset())

const char: Character = { name: 'Rio', voiceSpec: 'bright child', refPrompt: 'r', appearance: 'young bird, blue feathers' }

describe('mintCharacterImage', () => {
  it('mints a 1:1 reference and returns a CharacterImage', async () => {
    nanoBanana.mockResolvedValue({ url: 'https://img/rio' })
    const img = await mintCharacterImage(char)
    expect(img).toMatchObject({ name: 'Rio', url: 'https://img/rio', source: 'minted' })
    expect(typeof img.id).toBe('string')
    const [args] = nanoBanana.mock.calls[0]
    expect(args.aspectRatio).toBe('1:1')
    expect(args.prompt).toContain('blue feathers')
    expect(args.imageUrls).toBeUndefined()
  })
})

describe('sceneKeyframe', () => {
  it('composes present character images (edit) at 16:9', async () => {
    nanoBanana.mockResolvedValue({ url: 'https://img/key' })
    const scene: Scene = { id: '1', kind: 'TA2A', title: 't', speakers: ['Rio'], prompt: 'p', visual: 'wide shot, rain' }
    const url = await sceneKeyframe(scene, ['https://img/rio'])
    expect(url).toBe('https://img/key')
    const [args] = nanoBanana.mock.calls[0]
    expect(args.aspectRatio).toBe('16:9')
    expect(args.imageUrls).toEqual(['https://img/rio'])
    expect(args.prompt).toContain('rain')
  })

  it('omits imageUrls for narrator scenes with no present characters', async () => {
    nanoBanana.mockResolvedValue({ url: 'https://img/key2' })
    const scene: Scene = { id: '2', kind: 'T2A', title: 't', speakers: [], prompt: 'p', visual: 'empty street at dawn' }
    await sceneKeyframe(scene, [])
    const [args] = nanoBanana.mock.calls[0]
    expect(args.imageUrls).toBeUndefined()
  })
})

describe('buildCharacterImagePrompt', () => {
  it('falls back to voiceSpec when appearance is missing', () => {
    expect(buildCharacterImagePrompt({ name: 'X', voiceSpec: 'old sailor', refPrompt: 'r' })).toContain('old sailor')
  })
})
