import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./image', () => ({
  mintCharacterImage: vi.fn(async (c: { name: string }) => ({ id: c.name, name: c.name, url: `img:${c.name}`, source: 'minted', createdAt: 0 })),
  sceneKeyframe: vi.fn(async () => 'keyframe-url'),
}))
vi.mock('./video', () => ({
  generateSceneVideo: vi.fn(async () => ({ url: 'video-url' })),
}))

import { generateFromPlan } from './generate'
import { mintCharacterImage, sceneKeyframe } from './image'
import { generateSceneVideo } from './video'
import type { Plan } from '@/lib/types'

const plan: Plan = {
  category: 'Cartoon',
  characters: [
    { name: 'Rio', appearance: 'girl', voice: 'bright' },
    { name: 'Bo', appearance: 'robot', voice: 'deep' },
  ],
  scenes: [{ id: 's1', title: 'Meet', speakers: ['Rio', 'Bo'], visual: 'park', dialogue: 'Rio: "Hi"' }],
}

beforeEach(() => vi.clearAllMocks())

describe('generateFromPlan', () => {
  it('mints only missing character images and renders each shot', async () => {
    const scenes: string[] = []
    await generateFromPlan(
      plan,
      { characterLibrary: [{ id: 'x', name: 'Rio', url: 'lib:Rio', source: 'uploaded', createdAt: 0 }], videoModel: 'bytedance/seedance-2.0/image-to-video', aspect: 'landscape' },
      { onScene: (id) => scenes.push(id) },
    )
    // Rio is in the library, only Bo is minted.
    expect((mintCharacterImage as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].name)).toEqual(['Bo'])
    expect(sceneKeyframe).toHaveBeenCalledTimes(1)
    expect(generateSceneVideo).toHaveBeenCalledTimes(1)
    expect(scenes).toEqual(['s1'])
  })
})
