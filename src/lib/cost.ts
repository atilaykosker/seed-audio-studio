import type { Plan } from './types'

/** seed-audio-1.0 price: $0.1875 per minute of generated audio. */
const PER_MIN = 0.1875

/** Rough cost estimate for a plan: mint clips (~25s each) + scene clips (target by duration). */
export function estimatePlanCost(plan: Plan, targetDurationSec: number): number {
  const mintSeconds = plan.characters.length * 25
  const sceneSeconds = Math.max(plan.scenes.length, 1) * Math.min(targetDurationSec, 120)
  return ((mintSeconds + sceneSeconds) / 60) * PER_MIN
}

/** Cost of a single generated clip given its duration in seconds. */
export function clipCost(durationSec: number): number {
  return (durationSec / 60) * PER_MIN
}

export function formatUSD(n: number): string {
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
}
