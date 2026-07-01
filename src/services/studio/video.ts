import { klingVideo, type KlingElement, type QueuePhase } from '@/services/fal/client'
import type { Scene } from '@/lib/types'

/** Generate one scene's video via kling v3 i2v. Present character images become @Element1..3. */
export async function generateSceneVideo(
  scene: Scene,
  keyframeUrl: string,
  elementImageUrls: string[],
  durationSec: number,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  const elements: KlingElement[] = elementImageUrls.map((u) => ({ frontal_image_url: u }))
  return klingVideo(
    {
      prompt: (scene.visual && scene.visual.trim()) || scene.prompt,
      startImageUrl: keyframeUrl,
      durationSec,
      elements,
    },
    onPhase ? { onProgress: onPhase } : {},
  )
}
