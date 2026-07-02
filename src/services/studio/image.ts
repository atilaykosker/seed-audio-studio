import { nanoBanana } from '@/services/fal/client'
import { uid } from '@/lib/utils'
import type { BioStage, Character, CharacterImage, Scene } from '@/lib/types'

/** Prompt for a single-character reference image (reused across every shot). */
export function buildCharacterImagePrompt(c: Character): string {
  const look = c.appearance.trim() || 'a distinctive character'
  return `Character reference portrait of ${c.name}: ${look}. Centered, clear face, neutral plain background, consistent art style, full head-and-shoulders framing.`
}

/** Prompt for a shot establishing image used as the i2v start frame. */
export function buildKeyframePrompt(s: Scene, aspect: 'landscape' | 'portrait' = 'landscape'): string {
  const ratio = aspect === 'portrait' ? '9:16' : '16:9'
  const shot = s.visual.trim() || s.title
  return `Cinematic establishing frame, ${ratio}. ${shot}. Cohesive lighting and composition, no text or watermark.`
}

/** Mint one character's reference image via nano-banana (text-to-image, 1:1). */
export async function mintCharacterImage(c: Character): Promise<CharacterImage> {
  const { url } = await nanoBanana({ prompt: buildCharacterImagePrompt(c), aspectRatio: '1:1' })
  return { id: uid(), name: c.name, url, source: 'minted', createdAt: Date.now() }
}

/** Generate a shot keyframe. When characters are present, condition on their images (edit). */
export async function sceneKeyframe(
  scene: Scene,
  presentImageUrls: string[],
  aspect: 'landscape' | 'portrait' = 'landscape',
): Promise<string> {
  const { url } = await nanoBanana({
    prompt: buildKeyframePrompt(scene, aspect),
    aspectRatio: aspect === 'portrait' ? '9:16' : '16:9',
    ...(presentImageUrls.length ? { imageUrls: presentImageUrls } : {}),
  })
  return url
}

/** Prompt for a subject's reference portrait at one life stage (style-consistent). */
export function buildStageImagePrompt(subject: string, stage: BioStage, style: string): string {
  const look = stage.appearance.trim() || 'a distinctive person'
  const styleLine = style.trim() ? ` Style: ${style.trim()}.` : ''
  return `Character reference portrait of ${subject} as ${stage.label}: ${look}.${styleLine} Centered, clear face, neutral plain background, consistent art style, full head-and-shoulders framing.`
}

/** Mint one reference portrait for a subject's life stage. Named "<subject> — <stage label>". */
export async function mintStageImage(subject: string, stage: BioStage, style: string): Promise<CharacterImage> {
  const { url } = await nanoBanana({ prompt: buildStageImagePrompt(subject, stage, style), aspectRatio: '1:1' })
  return { id: uid(), name: `${subject} — ${stage.label}`, url, source: 'minted', createdAt: Date.now() }
}

/** Prompt for a biography shot keyframe, embedding the global style. */
export function buildBioKeyframePrompt(visual: string, style: string, aspect: 'landscape' | 'portrait' = 'landscape'): string {
  const ratio = aspect === 'portrait' ? '9:16' : '16:9'
  const styleLine = style.trim() ? ` Style: ${style.trim()}.` : ''
  return `Cinematic establishing frame, ${ratio}.${styleLine} ${visual.trim()}. Cohesive lighting and composition, no text or watermark.`
}

/** Generate a biography shot keyframe, conditioned on the stage portrait when provided. */
export async function bioKeyframe(
  visual: string,
  stageImageUrls: string[],
  style: string,
  aspect: 'landscape' | 'portrait' = 'landscape',
): Promise<string> {
  const { url } = await nanoBanana({
    prompt: buildBioKeyframePrompt(visual, style, aspect),
    aspectRatio: aspect === 'portrait' ? '9:16' : '16:9',
    ...(stageImageUrls.length ? { imageUrls: stageImageUrls } : {}),
  })
  return url
}
