import { klingVideo, type KlingElement, type QueuePhase } from '@/services/fal/client'
import type { Scene } from '@/lib/types'

/**
 * Map speakers' images (aligned to scene.speakers, `undefined` where a speaker has no image —
 * e.g. a narrator or an off-screen voice) to kling elements, renumbering `@ElementN` in the
 * prompt so it only references images actually sent. Imageless speakers (and their `@Element`
 * mentions) are dropped, and the remaining characters are renumbered 1..k in order — so a
 * scene like [Narrator, Bunny, Rio] still sends Bunny + Rio as @Element1 + @Element2.
 */
export function buildElementPrompt(
  prompt: string,
  mappedImageUrls: (string | undefined)[],
): { prompt: string; elements: KlingElement[] } {
  const elements: KlingElement[] = []
  const newIndexByOld = new Map<number, number>()
  mappedImageUrls.forEach((url, i) => {
    if (url) {
      elements.push({ frontal_image_url: url })
      newIndexByOld.set(i + 1, elements.length) // old 1-based speaker index -> new element index
    }
  })
  const capped = elements.slice(0, 3)
  const rewritten = prompt
    .replace(/@Element\s*(\d+)/gi, (_m, n) => {
      const nn = newIndexByOld.get(Number(n))
      return nn && nn <= capped.length ? `@Element${nn}` : ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
  return { prompt: rewritten, elements: capped }
}

/**
 * Generate one scene's video via kling v3 i2v. `mappedImageUrls` is aligned to `scene.speakers`
 * (undefined where a speaker has no character image); on-screen characters become @Element1..3.
 */
export async function generateSceneVideo(
  scene: Scene,
  keyframeUrl: string,
  mappedImageUrls: (string | undefined)[],
  durationSec: number,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  const { prompt, elements } = buildElementPrompt((scene.visual && scene.visual.trim()) || scene.prompt, mappedImageUrls)
  return klingVideo(
    { prompt, startImageUrl: keyframeUrl, durationSec, elements },
    onPhase ? { onProgress: onPhase } : {},
  )
}
