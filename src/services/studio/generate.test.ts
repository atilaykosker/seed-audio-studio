import { describe, it, expect, vi, beforeEach } from 'vitest'

const { seedAudio, uploadAsset } = vi.hoisted(() => ({ seedAudio: vi.fn(), uploadAsset: vi.fn() }))
vi.mock('@/services/fal/client', () => ({ seedAudio, uploadAsset }))
vi.mock('@/services/audio/trim', () => ({ fetchAndTrim: vi.fn(async () => new Blob()) }))

const { mintCharacterImage, sceneKeyframe } = vi.hoisted(() => ({ mintCharacterImage: vi.fn(), sceneKeyframe: vi.fn() }))
vi.mock('./image', () => ({ mintCharacterImage, sceneKeyframe }))

const { generateSceneVideo } = vi.hoisted(() => ({ generateSceneVideo: vi.fn() }))
vi.mock('./video', () => ({ generateSceneVideo }))

import { generateFromPlan } from './generate'
import type { Plan } from '@/lib/types'

beforeEach(() => {
  seedAudio.mockReset(); uploadAsset.mockReset(); mintCharacterImage.mockReset(); sceneKeyframe.mockReset(); generateSceneVideo.mockReset()
  seedAudio.mockResolvedValue({ url: 'https://audio', duration: 9 })
  uploadAsset.mockResolvedValue('https://hosted')
})

const plan: Plan = {
  category: 'Drama',
  characters: [{ name: 'A', voiceSpec: 's', refPrompt: 'r', appearance: 'tall' }],
  scenes: [{ id: 'sc1', kind: 'TA2A', title: 't', speakers: ['A'], prompt: 'p', visual: 'wide' }],
}

describe('generateFromPlan (video mode)', () => {
  it('mints a character image, builds a keyframe, and generates a scene video', async () => {
    mintCharacterImage.mockResolvedValue({ id: 'i1', name: 'A', url: 'https://charA', source: 'minted', createdAt: 0 })
    sceneKeyframe.mockResolvedValue('https://key')
    generateSceneVideo.mockResolvedValue({ url: 'https://vid' })

    const onSceneVideo = vi.fn()
    const onCharacterImage = vi.fn()
    await generateFromPlan(plan, { library: [], characterLibrary: [], withVideo: true }, { onCharacterImage, onSceneVideo })

    expect(onCharacterImage).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://charA' }))
    expect(sceneKeyframe).toHaveBeenCalledWith(plan.scenes[0], ['https://charA'])
    expect(generateSceneVideo).toHaveBeenCalledWith(plan.scenes[0], 'https://key', ['https://charA'], 9, expect.any(Function))
    expect(onSceneVideo).toHaveBeenCalledWith('sc1', 'https://vid')
  })

  it('skips all image/video work when withVideo is false', async () => {
    await generateFromPlan(plan, { library: [], withVideo: false }, {})
    expect(mintCharacterImage).not.toHaveBeenCalled()
    expect(sceneKeyframe).not.toHaveBeenCalled()
    expect(generateSceneVideo).not.toHaveBeenCalled()
  })

  it('reuses a character image from the library instead of minting', async () => {
    sceneKeyframe.mockResolvedValue('https://key')
    generateSceneVideo.mockResolvedValue({ url: 'https://vid' })
    await generateFromPlan(
      plan,
      { library: [], characterLibrary: [{ id: 'x', name: 'a', url: 'https://libA', source: 'minted', createdAt: 0 }], withVideo: true },
      {},
    )
    expect(mintCharacterImage).not.toHaveBeenCalled()
    expect(sceneKeyframe).toHaveBeenCalledWith(plan.scenes[0], ['https://libA'])
  })

  it('a video failure does not stop audio (onError scoped video:)', async () => {
    mintCharacterImage.mockResolvedValue({ id: 'i1', name: 'A', url: 'https://charA', source: 'minted', createdAt: 0 })
    sceneKeyframe.mockRejectedValue(new Error('boom'))
    const onScene = vi.fn()
    const onError = vi.fn()
    await generateFromPlan(plan, { library: [], characterLibrary: [], withVideo: true }, { onScene, onError })
    expect(onScene).toHaveBeenCalledWith('sc1', { url: 'https://audio', durationSec: 9 })
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('video:sc1'), expect.any(String))
  })
})
