import { getVideoModel, nativeVideo, type QueuePhase, type VideoModelId } from '@/services/fal/client'
import type { Scene } from '@/lib/types'

/**
 * Compose the prompt sent to the video model. Audio-capable models get the visual + a
 * voice-description line per speaker + the dialogue (so the same character sounds
 * consistent across shots — best-effort). Silent models get the visual only.
 */
export function buildVideoPrompt(scene: Scene, voiceByName: Map<string, string>, audio: boolean): string {
  const parts: string[] = [scene.visual.trim()]
  if (audio && scene.dialogue.trim()) {
    const voiceLines = scene.speakers
      .map((n) => {
        const v = voiceByName.get(n.toLowerCase())
        return v ? `${n} (${v})` : ''
      })
      .filter(Boolean)
    if (voiceLines.length) parts.push(`Voices — ${voiceLines.join('; ')}.`)
    parts.push(scene.dialogue.trim())
  }
  return parts.filter(Boolean).join('\n')
}

export interface GenerateSceneVideoArgs {
  model: VideoModelId
  scene: Scene
  keyframeUrl: string
  voiceByName: Map<string, string>
  durationSec: number
  aspect: 'landscape' | 'portrait'
}

/** Generate one shot's video (audio embedded when the model supports it). */
export async function generateSceneVideo(
  args: GenerateSceneVideoArgs,
  onPhase?: (p: QueuePhase) => void,
): Promise<{ url: string }> {
  const model = getVideoModel(args.model)
  const prompt = buildVideoPrompt(args.scene, args.voiceByName, model.audio)
  return nativeVideo(
    { model: args.model, prompt, startImageUrl: args.keyframeUrl, durationSec: args.durationSec, aspect: args.aspect },
    onPhase ? { onProgress: onPhase } : {},
  )
}
