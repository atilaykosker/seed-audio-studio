import type { BiographyPlan, Plan } from './types'
import { getVideoModel } from '@/services/fal/client'

/** nano-banana image price ($/image), for characters + shot keyframes. */
const IMAGE_EACH = 0.039

/** Cost of one generated shot on a model at a given duration (seconds). */
export function clipCost(videoModel: string, durationSec: number): number {
  return getVideoModel(videoModel).pricePerSec * durationSec
}

/**
 * Rough cost estimate: one reference image per character + one keyframe per shot, plus
 * each shot's video at the selected model's per-second price.
 */
export function estimatePlanCost(plan: Plan, videoModel: string, shotSec = 8): number {
  const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
  const video = plan.scenes.length * shotSec * getVideoModel(videoModel).pricePerSec
  return images + video
}

/** Cost estimate for a biography: one portrait per stage + each shot's silent video. */
export function estimateBioCost(plan: BiographyPlan, videoModel: string, shotSec: number): number {
  const shots = plan.pages.reduce((n, p) => n + p.shots.length, 0)
  const images = plan.stages.length * IMAGE_EACH
  const video = shots * shotSec * getVideoModel(videoModel).pricePerSec
  return images + video
}

export function formatUSD(n: number): string {
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
}
