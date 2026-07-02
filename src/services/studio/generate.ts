import type { QueuePhase, VideoModelId } from '@/services/fal/client'
import { bioKeyframe, mintCharacterImage, mintStageImage, sceneKeyframe } from './image'
import { generateBioShotVideo, generateSceneVideo } from './video'
import type { BiographyPlan, BioShot, CharacterImage, Plan, Scene } from '@/lib/types'

export interface GenerateCallbacks {
  onCharacterImage?: (img: CharacterImage) => void
  onSceneStart?: (sceneId: string) => void
  onKeyframe?: (sceneId: string, url: string) => void
  onScenePhase?: (sceneId: string, phase: QueuePhase) => void
  onScene?: (sceneId: string, result: { url: string }) => void
  onError?: (scope: string, message: string) => void
}

export interface SceneClipArgs {
  scene: Scene
  imageByName: Map<string, string>
  voiceByName: Map<string, string>
  videoModel: VideoModelId
  aspect: 'landscape' | 'portrait'
  durationSec: number
}

/**
 * Render one shot: compose the present characters into a keyframe, then generate the
 * video (audio embedded when the model supports it). Reused by the full run and by regen.
 */
export async function generateSceneClip(
  args: SceneClipArgs,
  cb: Pick<GenerateCallbacks, 'onKeyframe' | 'onScenePhase'> = {},
): Promise<{ url: string }> {
  const presentImages = args.scene.speakers
    .map((n) => args.imageByName.get(n.toLowerCase()))
    .filter((u): u is string => !!u)
  const keyframe = await sceneKeyframe(args.scene, presentImages, args.aspect)
  cb.onKeyframe?.(args.scene.id, keyframe)
  return generateSceneVideo(
    {
      model: args.videoModel,
      scene: args.scene,
      keyframeUrl: keyframe,
      voiceByName: args.voiceByName,
      durationSec: args.durationSec,
      aspect: args.aspect,
    },
    (p) => cb.onScenePhase?.(args.scene.id, p),
  )
}

/**
 * Full pipeline: mint any missing character images (reuse the library by name), then
 * render every shot in order. Voice descriptions come from the plan's characters.
 */
export async function generateFromPlan(
  plan: Plan,
  args: { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape' | 'portrait' },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const imageByName = new Map<string, string>()
  for (const img of args.characterLibrary ?? []) imageByName.set(img.name.toLowerCase(), img.url)
  const voiceByName = new Map<string, string>()
  for (const c of plan.characters) voiceByName.set(c.name.toLowerCase(), c.voice)

  for (const c of plan.characters) {
    const key = c.name.toLowerCase()
    if (imageByName.has(key)) continue
    try {
      const img = await mintCharacterImage(c)
      cb.onCharacterImage?.(img)
      imageByName.set(key, img.url)
    } catch (e) {
      cb.onError?.(`image:${c.name}`, e instanceof Error ? e.message : String(e))
    }
  }

  for (const scene of plan.scenes) {
    cb.onSceneStart?.(scene.id)
    try {
      const r = await generateSceneClip(
        { scene, imageByName, voiceByName, videoModel: args.videoModel, aspect: args.aspect, durationSec: 8 },
        cb,
      )
      cb.onScene?.(scene.id, r)
    } catch (e) {
      cb.onError?.(`scene:${scene.id}`, e instanceof Error ? e.message : String(e))
    }
  }
}

export interface BioClipArgs {
  shot: BioShot
  /** stageId → minted portrait URL. */
  stageImageById: Map<string, string>
  style: string
  videoModel: VideoModelId
  aspect: 'landscape' | 'portrait'
  shotSec: number
}

/** Render one biography shot: stage-conditioned keyframe → silent video. Reused by run + regen. */
export async function generateBioShot(
  args: BioClipArgs,
  cb: Pick<GenerateCallbacks, 'onKeyframe' | 'onScenePhase'> = {},
): Promise<{ url: string }> {
  const stageUrl = args.shot.stageId ? args.stageImageById.get(args.shot.stageId) : undefined
  const keyframe = await bioKeyframe(args.shot.visual, stageUrl ? [stageUrl] : [], args.style, args.aspect)
  cb.onKeyframe?.(args.shot.id, keyframe)
  return generateBioShotVideo(
    {
      model: args.videoModel,
      style: args.style,
      visual: args.shot.visual,
      keyframeUrl: keyframe,
      durationSec: args.shotSec,
      aspect: args.aspect,
    },
    (p) => cb.onScenePhase?.(args.shot.id, p),
  )
}

/**
 * Full biography pipeline: mint any missing per-stage reference portraits (reuse the library
 * by "<subject> — <stage label>"), then render every shot (silent) in page order.
 */
export async function generateBiography(
  plan: BiographyPlan,
  args: { characterLibrary?: CharacterImage[]; videoModel: VideoModelId; aspect: 'landscape' | 'portrait'; shotSec: number },
  cb: GenerateCallbacks = {},
): Promise<void> {
  const libByName = new Map<string, string>()
  for (const img of args.characterLibrary ?? []) libByName.set(img.name.toLowerCase(), img.url)

  const stageImageById = new Map<string, string>()
  for (const stage of plan.stages) {
    const name = `${plan.subject} — ${stage.label}`
    const existing = libByName.get(name.toLowerCase())
    if (existing) {
      stageImageById.set(stage.id, existing)
      continue
    }
    try {
      const img = await mintStageImage(plan.subject, stage, plan.style)
      cb.onCharacterImage?.(img)
      stageImageById.set(stage.id, img.url)
    } catch (e) {
      cb.onError?.(`image:${name}`, e instanceof Error ? e.message : String(e))
    }
  }

  for (const page of plan.pages) {
    for (const shot of page.shots) {
      cb.onSceneStart?.(shot.id)
      try {
        const r = await generateBioShot(
          { shot, stageImageById, style: plan.style, videoModel: args.videoModel, aspect: args.aspect, shotSec: args.shotSec },
          cb,
        )
        cb.onScene?.(shot.id, r)
      } catch (e) {
        cb.onError?.(`scene:${shot.id}`, e instanceof Error ? e.message : String(e))
      }
    }
  }
}
