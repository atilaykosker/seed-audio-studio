// src/server/pipeline/inputs.test.ts
import { describe, it, expect } from 'vitest'
import { characterMintJob, sceneKeyframeJob, sceneVideoJob, bioVideoJob } from './inputs'
import { ENDPOINTS } from '../../services/fal/client'
import type { Character, Scene } from '../../lib/types'

const character: Character = { name: 'Robot', appearance: 'tin', voice: 'metallic' }
const scene: Scene = { id: 's1', title: 'T', speakers: ['Robot'], visual: 'robot waves', dialogue: 'Hi' }

describe('characterMintJob', () => {
  it('targets nano-banana base t2i with a 1:1 aspect and no refs', () => {
    const { endpointId, input } = characterMintJob(character)
    expect(endpointId).toBe(ENDPOINTS.nanoBanana)
    expect(input.aspect_ratio).toBe('1:1')
    expect(input.image_urls).toBeUndefined()
    expect(typeof input.prompt).toBe('string')
  })
})

describe('sceneKeyframeJob', () => {
  it('uses the edit endpoint and passes image_urls when refs present', () => {
    const { endpointId, input } = sceneKeyframeJob(scene, ['https://s3/a.png'], 'landscape')
    expect(endpointId).toBe(ENDPOINTS.nanoBananaEdit)
    expect(input.image_urls).toEqual(['https://s3/a.png'])
    expect(input.aspect_ratio).toBe('16:9')
  })
  it('uses the base endpoint with no refs', () => {
    const { endpointId, input } = sceneKeyframeJob(scene, [], 'portrait')
    expect(endpointId).toBe(ENDPOINTS.nanoBanana)
    expect(input.image_urls).toBeUndefined()
    expect(input.aspect_ratio).toBe('9:16')
  })
})

describe('video jobs', () => {
  it('sceneVideoJob targets the model id and sets start image + duration', () => {
    const { endpointId, input } = sceneVideoJob('bytedance/seedance-2.0/image-to-video', scene, 'https://s3/k.png', new Map([['Robot', 'metallic']]), 8, 'landscape')
    expect(endpointId).toBe('bytedance/seedance-2.0/image-to-video')
    expect(input.image_url).toBe('https://s3/k.png')
    expect(String(input.duration)).toContain('8')
  })
  it('bioVideoJob forces silent audio', () => {
    const { input } = bioVideoJob('bytedance/seedance-2.0/image-to-video', 'watercolor', 'a lab', 'https://s3/k.png', 8, 'landscape')
    expect(input.generate_audio).toBe(false)
  })
})
