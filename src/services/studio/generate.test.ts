import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./image', () => ({
  mintCharacterImage: vi.fn(async (c: { name: string }) => ({ id: c.name, name: c.name, url: `img:${c.name}`, source: 'minted', createdAt: 0 })),
  sceneKeyframe: vi.fn(async () => 'keyframe-url'),
  mintStageImage: vi.fn(async (subject: string, stage: { label: string }) => ({ id: `${subject}-${stage.label}`, name: `${subject} — ${stage.label}`, url: `img:${subject}:${stage.label}`, source: 'minted', createdAt: 0 })),
  bioKeyframe: vi.fn(async () => 'bio-keyframe-url'),
}))
vi.mock('./video', () => ({
  generateSceneVideo: vi.fn(async () => ({ url: 'video-url' })),
  generateBioShotVideo: vi.fn(async () => ({ url: 'bio-video-url' })),
}))

import { generateFromPlan, generateBiography } from './generate'
import { mintCharacterImage, sceneKeyframe, mintStageImage, bioKeyframe } from './image'
import { generateSceneVideo, generateBioShotVideo } from './video'
import type { BiographyPlan, Plan } from '@/lib/types'

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

const bioPlan: BiographyPlan = {
  subject: 'Ada',
  style: 'painterly',
  stages: [
    { id: 'st1', label: 'child ~10', appearance: 'young' },
    { id: 'st2', label: 'adult', appearance: 'grown' },
  ],
  pages: [
    { id: 'p1', index: 1, narration: 'n1', shots: [{ id: 's1', stageId: 'st1', visual: 'v1' }, { id: 's2', stageId: 'st1', visual: 'v2' }] },
    { id: 'p2', index: 2, narration: 'n2', shots: [{ id: 's3', stageId: 'st2', visual: 'v3' }] },
  ],
}

describe('generateBiography', () => {
  it('mints only missing stage portraits and renders each shot silently', async () => {
    const done: string[] = []
    await generateBiography(
      bioPlan,
      { characterLibrary: [{ id: 'x', name: 'Ada — child ~10', url: 'lib:child', source: 'uploaded', createdAt: 0 }], videoModel: 'bytedance/seedance-2.0/image-to-video', aspect: 'landscape', shotSec: 6 },
      { onScene: (id) => done.push(id) },
    )
    // "child ~10" is in the library; only "adult" is minted.
    expect((mintStageImage as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].label)).toEqual(['adult'])
    expect(bioKeyframe).toHaveBeenCalledTimes(3)
    expect(generateBioShotVideo).toHaveBeenCalledTimes(3)
    expect(done).toEqual(['s1', 's2', 's3'])
  })
})
