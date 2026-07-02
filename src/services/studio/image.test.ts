import { describe, it, expect } from 'vitest'
import { buildCharacterImagePrompt, buildKeyframePrompt } from './image'
import type { Character, Scene } from '@/lib/types'

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
