import { seedAudio, uploadAsset, type QueuePhase } from '@/services/fal/client'
import { fetchAndTrim } from '@/services/audio/trim'
import { mintCharacterImage, sceneKeyframe } from './image'
import { generateSceneVideo } from './video'
import { uid } from '@/lib/utils'
import type { Character, CharacterImage, Plan, Scene, Voice } from '@/lib/types'

export interface GenerateCallbacks {
  onMintStart?: (name: string) => void
  onVoice?: (voice: Voice) => void
  onSceneStart?: (sceneId: string) => void
  onScenePhase?: (sceneId: string, phase: QueuePhase) => void
  onScene?: (sceneId: string, result: { url: string; durationSec: number }) => void
  onError?: (scope: string, message: string) => void
  // video mode
  onCharacterImage?: (img: CharacterImage) => void
  onKeyframe?: (sceneId: string, url: string) => void
  onSceneVideoStart?: (sceneId: string) => void
  onSceneVideoPhase?: (sceneId: string, phase: QueuePhase) => void
  onSceneVideo?: (sceneId: string, url: string) => void
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
 * Full pipeline: mint any missing character voices (and, in video mode, character images),
 * then generate every scene in order (audio, then keyframe + video when `withVideo`).
 * `library` voices and `characterLibrary` images whose name matches a character are reused.
 */
export async function generateFromPlan(
  plan: Plan,
  args: { library: Voice[]; characterLibrary?: CharacterImage[]; withVideo?: boolean },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const withVideo = !!args.withVideo
  const urlByName = new Map<string, string>()
  for (const v of args.library) urlByName.set(v.name.toLowerCase(), v.url)

  // Character voice url + (video) image url, by character name.
  const resolved = new Map<string, string>()
  const imageByName = new Map<string, string>()
  for (const img of args.characterLibrary ?? []) imageByName.set(img.name.toLowerCase(), img.url)

  for (const c of plan.characters) {
    const key = c.name.toLowerCase()
    const existing = urlByName.get(key)
    if (existing) {
      resolved.set(c.name, existing)
    } else {
      cb.onMintStart?.(c.name)
      try {
        const v = await mintVoice(c)
        cb.onVoice?.(v)
        resolved.set(c.name, v.url)
      } catch (e) {
        cb.onError?.(`voice:${c.name}`, e instanceof Error ? e.message : String(e))
      }
    }
    if (withVideo && !imageByName.has(key)) {
      try {
        const img = await mintCharacterImage(c)
        cb.onCharacterImage?.(img)
        imageByName.set(key, img.url)
      } catch (e) {
        cb.onError?.(`image:${c.name}`, e instanceof Error ? e.message : String(e))
      }
    }
  }

  for (const scene of plan.scenes) {
    cb.onSceneStart?.(scene.id)
    let durationSec = 10
    try {
      const r = await generateScene(scene, resolved, cb)
      durationSec = r.durationSec || 10
      cb.onScene?.(scene.id, r)
    } catch (e) {
      cb.onError?.(`scene:${scene.id}`, e instanceof Error ? e.message : String(e))
    }

    if (withVideo) {
      cb.onSceneVideoStart?.(scene.id)
      try {
        const presentImages = scene.speakers
          .map((n) => imageByName.get(n.toLowerCase()))
          .filter((u): u is string => !!u)
        const keyframe = await sceneKeyframe(scene, presentImages)
        cb.onKeyframe?.(scene.id, keyframe)
        const v = await generateSceneVideo(scene, keyframe, presentImages, durationSec, (p) =>
          cb.onSceneVideoPhase?.(scene.id, p),
        )
        cb.onSceneVideo?.(scene.id, v.url)
      } catch (e) {
        cb.onError?.(`video:${scene.id}`, e instanceof Error ? e.message : String(e))
      }
    }
  }
}
