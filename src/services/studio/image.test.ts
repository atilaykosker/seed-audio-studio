import { describe, it, expect } from 'vitest'
import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from './image'
import type { Character, Scene, BioStage } from '@/lib/types'

describe('image prompts', () => {
  it('uses appearance for the character portrait', () => {
    const c: Character = { name: 'Rio', appearance: 'young girl in a red hoodie', voice: 'bright' }
    expect(buildCharacterImagePrompt(c)).toContain('young girl in a red hoodie')
    expect(buildCharacterImagePrompt(c)).toContain('Rio')
  })

  it('uses the scene visual for the keyframe and reflects orientation', () => {
    const s: Scene = { id: '1', title: 'Meet', speakers: [], visual: 'sunny park wide shot', dialogue: '' }
    expect(buildKeyframePrompt(s, 'portrait')).toContain('sunny park wide shot')
    expect(buildKeyframePrompt(s, 'portrait')).toContain('9:16')
    expect(buildKeyframePrompt(s, 'landscape')).toContain('16:9')
  })
})

describe('biography image prompts', () => {
  it('embeds subject, stage label/appearance and global style in the portrait prompt', () => {
    const stage: BioStage = { id: '1', label: 'child ~10', appearance: 'young girl, curls' }
    const p = buildStageImagePrompt('Ada Lovelace', stage, 'painterly educational animation')
    expect(p).toContain('Ada Lovelace')
    expect(p).toContain('child ~10')
    expect(p).toContain('young girl, curls')
    expect(p).toContain('painterly educational animation')
  })

  it('embeds the visual, style and orientation ratio in the keyframe prompt', () => {
    const p = buildBioKeyframePrompt('A girl studies by candlelight', 'warm cinematic style', 'portrait')
    expect(p).toContain('A girl studies by candlelight')
    expect(p).toContain('warm cinematic style')
    expect(p).toContain('9:16')
    expect(buildBioKeyframePrompt('x', 'y', 'landscape')).toContain('16:9')
  })
})
