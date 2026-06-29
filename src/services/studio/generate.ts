import { seedAudio, uploadAsset, type QueuePhase } from '@/services/fal/client'
import { fetchAndTrim } from '@/services/audio/trim'
import { uid } from '@/lib/utils'
import type { Character, Plan, Scene, Voice } from '@/lib/types'

export interface GenerateCallbacks {
  onMintStart?: (name: string) => void
  onVoice?: (voice: Voice) => void
  onSceneStart?: (sceneId: string) => void
  onScenePhase?: (sceneId: string, phase: QueuePhase) => void
  onScene?: (sceneId: string, result: { url: string; durationSec: number }) => void
  onError?: (scope: string, message: string) => void
}

/** Mint one character's reference voice: T2A → trim ≤28s → upload to fal CDN. */
export async function mintVoice(c: Character): Promise<Voice> {
  const { url } = await seedAudio({ prompt: c.refPrompt, outputFormat: 'mp3' })
  const trimmed = await fetchAndTrim(url, 28)
  const hosted = await uploadAsset(trimmed)
  // duration ~minted; recompute cheaply from the trimmed blob isn't necessary for UI.
  return {
    id: uid(),
    name: c.name,
    voiceSpec: c.voiceSpec,
    url: hosted,
    durationSec: 0,
    source: 'minted',
    createdAt: Date.now(),
  }
}

function isOverLimitError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /30|exceed|maximum/i.test(m) && /second|duration|audio/i.test(m)
}

/** Generate one scene. TA2A maps speakers→@Audio order. 422 "exceeds 30s" → re-trim + retry once. */
export async function generateScene(
  scene: Scene,
  urlByName: Map<string, string>,
  cb: GenerateCallbacks = {},
): Promise<{ url: string; durationSec: number }> {
  const onProgress = (phase: QueuePhase) => cb.onScenePhase?.(scene.id, phase)
  const buildUrls = () =>
    scene.kind === 'TA2A'
      ? scene.speakers.map((n) => urlByName.get(n)).filter((u): u is string => !!u)
      : undefined

  try {
    const r = await seedAudio({ prompt: scene.prompt, audioUrls: buildUrls() }, { onProgress })
    return { url: r.url, durationSec: r.duration }
  } catch (e) {
    if (scene.kind === 'TA2A' && isOverLimitError(e)) {
      // A reference slipped over 30s — re-trim each speaker ref and retry once.
      for (const n of scene.speakers) {
        const u = urlByName.get(n)
        if (!u) continue
        const re = await uploadAsset(await fetchAndTrim(u, 27))
        urlByName.set(n, re)
      }
      const r = await seedAudio({ prompt: scene.prompt, audioUrls: buildUrls() }, { onProgress })
      return { url: r.url, durationSec: r.duration }
    }
    throw e
  }
}

/**
 * Full pipeline: mint any missing character voices, then generate every scene in order.
 * `library` voices whose name matches a character are reused (no re-mint).
 */
export async function generateFromPlan(
  plan: Plan,
  args: { library: Voice[] },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const urlByName = new Map<string, string>()
  for (const v of args.library) urlByName.set(v.name.toLowerCase(), v.url)

  // Map character name -> url, minting if absent.
  const resolved = new Map<string, string>()
  for (const c of plan.characters) {
    const existing = urlByName.get(c.name.toLowerCase())
    if (existing) {
      resolved.set(c.name, existing)
      continue
    }
    cb.onMintStart?.(c.name)
    try {
      const v = await mintVoice(c)
      cb.onVoice?.(v)
      resolved.set(c.name, v.url)
    } catch (e) {
      cb.onError?.(`voice:${c.name}`, e instanceof Error ? e.message : String(e))
    }
  }

  for (const scene of plan.scenes) {
    cb.onSceneStart?.(scene.id)
    try {
      const r = await generateScene(scene, resolved, cb)
      cb.onScene?.(scene.id, r)
    } catch (e) {
      cb.onError?.(`scene:${scene.id}`, e instanceof Error ? e.message : String(e))
    }
  }
}
