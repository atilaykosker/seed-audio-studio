import { describe, it, expect } from 'vitest'
import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from '../../services/studio/image'
import { buildVideoPrompt, buildBioVideoPrompt } from '../../services/studio/video'
import type { Character, Scene, BioStage } from '../../lib/types'

describe('reused prompt builders are exported and callable', () => {
  const character: Character = { name: 'Robot', appearance: 'a tin robot', voice: 'metallic' }
  const scene: Scene = { id: 's1', title: 'T', speakers: ['Robot'], visual: 'robot waves', dialogue: 'Hi' }
  const stage: BioStage = { id: 'st1', label: 'child', appearance: 'young' }

  it('character/keyframe/stage/bio-keyframe prompts return non-empty strings', () => {
    expect(buildCharacterImagePrompt(character)).toBeTruthy()
    expect(buildKeyframePrompt(scene, 'landscape')).toBeTruthy()
    expect(buildStageImagePrompt('Ada', stage, 'watercolor')).toBeTruthy()
    expect(buildBioKeyframePrompt('a lab', 'watercolor', 'landscape')).toBeTruthy()
  })
  it('video prompts return non-empty strings', () => {
    expect(buildVideoPrompt(scene, new Map([['robot', 'metallic']]), true)).toBeTruthy()
    expect(buildBioVideoPrompt('watercolor', 'a lab')).toBeTruthy()
  })
})
