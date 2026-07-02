import type { QueuePhase, VideoModelId } from '@/services/fal/client'
import { mintCharacterImage, sceneKeyframe } from './image'
import { generateSceneVideo } from './video'
import type { CharacterImage, Plan, Scene } from '@/lib/types'

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
