// src/server/pipeline/inputs.ts
import type { Character, Scene, BioStage, BiographyPlan, BioShot, BioPage } from '../../lib/types'
import { ENDPOINTS, buildVideoInput, getVideoModel, type VideoModelId } from '../../services/fal/client'
import { buildCharacterImagePrompt, buildKeyframePrompt, buildStageImagePrompt, buildBioKeyframePrompt } from '../../services/studio/image'
import { buildVideoPrompt, buildBioVideoPrompt } from '../../services/studio/video'

export interface FalJob { endpointId: string; input: Record<string, unknown> }
type Aspect = 'landscape' | 'portrait'
const ar = (a: Aspect) => (a === 'portrait' ? '9:16' : '16:9')

/** Locate a biography shot (and its page) by shot id across every page. */
export function findBioShot(bioPlan: BiographyPlan, shotId: string): { shot: BioShot; page: BioPage } | null {
  for (const page of bioPlan.pages) {
    const shot = page.shots.find((s) => s.id === shotId)
    if (shot) return { shot, page }
  }
  return null
}

export function characterMintJob(c: Character): FalJob {
  return { endpointId: ENDPOINTS.nanoBanana, input: { prompt: buildCharacterImagePrompt(c), aspect_ratio: '1:1' } }
}
export function stageMintJob(subject: string, stage: BioStage, style: string): FalJob {
  return { endpointId: ENDPOINTS.nanoBanana, input: { prompt: buildStageImagePrompt(subject, stage, style), aspect_ratio: '1:1' } }
}
export function sceneKeyframeJob(scene: Scene, presentImageUrls: string[], aspect: Aspect): FalJob {
  const hasRefs = presentImageUrls.length > 0
  return {
    endpointId: hasRefs ? ENDPOINTS.nanoBananaEdit : ENDPOINTS.nanoBanana,
    input: { prompt: buildKeyframePrompt(scene, aspect), aspect_ratio: ar(aspect), ...(hasRefs ? { image_urls: presentImageUrls } : {}) },
  }
}
export function bioKeyframeJob(visual: string, stageImageUrls: string[], style: string, aspect: Aspect): FalJob {
  const hasRefs = stageImageUrls.length > 0
  return {
    endpointId: hasRefs ? ENDPOINTS.nanoBananaEdit : ENDPOINTS.nanoBanana,
    input: { prompt: buildBioKeyframePrompt(visual, style, aspect), aspect_ratio: ar(aspect), ...(hasRefs ? { image_urls: stageImageUrls } : {}) },
  }
}
export function sceneVideoJob(videoModel: VideoModelId, scene: Scene, keyframeUrl: string, voiceByName: Map<string, string>, durationSec: number, aspect: Aspect): FalJob {
  const model = getVideoModel(videoModel)
  return { endpointId: model.id, input: buildVideoInput(model, { prompt: buildVideoPrompt(scene, voiceByName, model.audio), startImageUrl: keyframeUrl, durationSec, aspect }) }
}
export function bioVideoJob(videoModel: VideoModelId, style: string, visual: string, keyframeUrl: string, durationSec: number, aspect: Aspect): FalJob {
  const model = getVideoModel(videoModel)
  return { endpointId: model.id, input: buildVideoInput(model, { prompt: buildBioVideoPrompt(style, visual), startImageUrl: keyframeUrl, durationSec, aspect, forceSilent: true }) }
}
