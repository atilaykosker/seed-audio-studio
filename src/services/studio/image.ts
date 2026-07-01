import { nanoBanana } from '@/services/fal/client'
import { uid } from '@/lib/utils'
import type { Character, CharacterImage, Scene } from '@/lib/types'

/** Prompt for a single-character reference image (reused across every scene). */
export function buildCharacterImagePrompt(c: Character): string {
  const look = (c.appearance && c.appearance.trim()) || c.voiceSpec || 'a distinctive character'
  return `Character reference portrait of ${c.name}: ${look}. Centered, clear face, neutral plain background, consistent art style, full head-and-shoulders framing.`
}

/** Prompt for a scene establishing image used as the kling start frame. */
export function buildKeyframePrompt(s: Scene): string {
  const shot = (s.visual && s.visual.trim()) || s.title
  return `Cinematic establishing frame, 16:9. ${shot}. Cohesive lighting and composition, no text or watermark.`
}

/** Mint one character's reference image via nano-banana (text-to-image, 1:1). */
export async function mintCharacterImage(c: Character): Promise<CharacterImage> {
  const { url } = await nanoBanana({ prompt: buildCharacterImagePrompt(c), aspectRatio: '1:1' })
  return { id: uid(), name: c.name, url, source: 'minted', createdAt: Date.now() }
}

/** Generate a scene keyframe. When characters are present, condition on their images (edit). */
export async function sceneKeyframe(scene: Scene, presentImageUrls: string[]): Promise<string> {
  const { url } = await nanoBanana({
    prompt: buildKeyframePrompt(scene),
    aspectRatio: '16:9',
    ...(presentImageUrls.length ? { imageUrls: presentImageUrls } : {}),
  })
  return url
}
