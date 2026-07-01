import type { Plan } from './types'

/** seed-audio-1.0 price: $0.1875 per minute of generated audio. */
const PER_MIN = 0.1875

/** nano-banana image price ($/image) and kling v3 i2v price ($/sec, audio off). */
const IMAGE_EACH = 0.039
const VIDEO_PER_SEC = 0.112
/** Assumed kling clip length used for pre-generation estimates. */
const VIDEO_SEC = 10

/** Rough cost estimate for a plan: mint clips (~25s each) + scene clips, plus images+video when withVideo. */
export function estimatePlanCost(plan: Plan, targetDurationSec: number, withVideo = false): number {
  const mintSeconds = plan.characters.length * 25
  const sceneSeconds = Math.max(plan.scenes.length, 1) * Math.min(targetDurationSec, 120)
  const audio = ((mintSeconds + sceneSeconds) / 60) * PER_MIN
  if (!withVideo) return audio
  const images = (plan.characters.length + plan.scenes.length) * IMAGE_EACH
  const video = plan.scenes.length * VIDEO_SEC * VIDEO_PER_SEC
  return audio + images + video
}

/** Cost of a single generated clip given its duration in seconds. */
export function clipCost(durationSec: number): number {
  return (durationSec / 60) * PER_MIN
}

export function formatUSD(n: number): string {
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
}
