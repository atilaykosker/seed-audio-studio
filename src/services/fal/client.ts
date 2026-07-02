import { fal } from '@fal-ai/client'

let configuredKey: string | null = null

/** Point the fal client at the user's key. Safe to call repeatedly. */
export function configureFal(key: string): void {
  if (key === configuredKey) return
  fal.config({ credentials: key })
  configuredKey = key
}

export function isConfigured(): boolean {
  return configuredKey != null
}

export type QueuePhase = 'queued' | 'running' | 'done'

/** Thrown when a fal request exceeds its timeout (a stalled queue job). Retryable. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${Math.round(ms / 1000)}s.`)
    this.name = 'TimeoutError'
  }
}

export interface RunOptions {
  onProgress?: (phase: QueuePhase, position?: number) => void
  /** Abort the request (and stop polling) after this many ms. Omit for no timeout. */
  timeoutMs?: number
  /** External signal to cancel the request (e.g. a Stop button). */
  signal?: AbortSignal
}

interface QueueUpdate {
  status: string
  queue_position?: number
}

/** Generic subscribe wrapper: submit → poll → result. Returns data + requestId. */
export async function run<T = unknown>(
  endpointId: string,
  input: Record<string, unknown>,
  opts: RunOptions = {},
): Promise<{ data: T; requestId: string }> {
  const controller = new AbortController()
  // Chain an external cancel signal (Stop button) into our controller.
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timer =
    opts.timeoutMs != null
      ? setTimeout(() => controller.abort(new TimeoutError(opts.timeoutMs!)), opts.timeoutMs)
      : undefined
  try {
    const res = await fal.subscribe(endpointId, {
      input,
      logs: false,
      abortSignal: controller.signal,
      onQueueUpdate: (u: QueueUpdate) => {
        if (u.status === 'IN_QUEUE') opts.onProgress?.('queued', u.queue_position)
        else if (u.status === 'IN_PROGRESS') opts.onProgress?.('running')
        else if (u.status === 'COMPLETED') opts.onProgress?.('done')
      },
    })
    return { data: res.data as T, requestId: res.requestId }
  } catch (e) {
    // Distinguish a timeout-triggered abort from an external cancel or a real error.
    if (controller.signal.aborted && opts.timeoutMs != null && !opts.signal?.aborted) {
      throw new TimeoutError(opts.timeoutMs)
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Default timeouts (ms) per model — generous backstops above realistic durations. */
export const TIMEOUTS = {
  llm: 120_000, // plans ~23s observed; catch true stalls
  image: 180_000,
  video: 600_000, // kling video legitimately takes minutes
} as const

/** Upload a blob/file to fal's CDN, returning a hosted URL usable as model input. */
export async function uploadAsset(blob: Blob): Promise<string> {
  return fal.storage.upload(blob)
}

export const ENDPOINTS = {
  /** fal's OpenRouter gateway for LLM planning/categorization. */
  llm: 'openrouter/router',
  /** Text-to-image for character references / scene keyframes. */
  nanoBanana: 'fal-ai/nano-banana',
  /** Image-conditioned edit variant (compose characters into a keyframe). */
  nanoBananaEdit: 'fal-ai/nano-banana/edit',
} as const

export interface ModelOption {
  id: string
  label: string
}

/** OpenRouter model ids surfaced in the picker (verified available on fal). */
export const MODELS: ModelOption[] = [
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet' },
  { id: 'openai/gpt-5-chat', label: 'GPT-5 Chat' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-v3.1-terminus', label: 'DeepSeek V3.1' },
]

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

interface LlmOutput {
  output: string
  reasoning?: string | null
  error?: string | null
}

/** One-shot text completion via fal's OpenRouter gateway. Returns the model's text. */
export async function llmText(
  args: {
    prompt: string
    systemPrompt?: string
    model?: string
    temperature?: number
    maxTokens?: number
  },
  opts: RunOptions = {},
): Promise<string> {
  const { data } = await run<LlmOutput>(
    ENDPOINTS.llm,
    {
      prompt: args.prompt,
      model: args.model ?? DEFAULT_MODEL,
      ...(args.systemPrompt ? { system_prompt: args.systemPrompt } : {}),
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.maxTokens != null ? { max_tokens: args.maxTokens } : {}),
    },
    { timeoutMs: TIMEOUTS.llm, ...opts },
  )
  if (data.error) throw new Error(data.error)
  return data.output
}

interface NanoBananaOutput {
  images: { url: string; content_type?: string }[]
  description?: string
}

/** Generate one image. With `imageUrls`, uses the edit endpoint (image-conditioned). */
export async function nanoBanana(
  args: { prompt: string; imageUrls?: string[]; aspectRatio?: string },
  opts: RunOptions = {},
): Promise<{ url: string }> {
  const hasRefs = !!(args.imageUrls && args.imageUrls.length)
  const input: Record<string, unknown> = { prompt: args.prompt }
  if (args.aspectRatio) input.aspect_ratio = args.aspectRatio
  if (hasRefs) input.image_urls = args.imageUrls
  const { data } = await run<NanoBananaOutput>(
    hasRefs ? ENDPOINTS.nanoBananaEdit : ENDPOINTS.nanoBanana,
    input,
    { timeoutMs: TIMEOUTS.image, ...opts },
  )
  const url = data.images?.[0]?.url
  if (!url) throw new Error('nano-banana returned no image.')
  return { url }
}

export type VideoModelId =
  | 'fal-ai/veo3.1/image-to-video'
  | 'fal-ai/veo3.1/fast/image-to-video'
  | 'bytedance/seedance-2.0/image-to-video'
  | 'bytedance/seedance-2.0/fast/image-to-video'
  | 'fal-ai/kling-video/v3/pro/image-to-video'

export interface VideoModel {
  id: VideoModelId
  label: string
  /** One-line tradeoff shown in the picker. */
  description: string
  /** USD per second of generated video (720p). */
  pricePerSec: number
  maxDurationSec: number
  /** Whether the model generates native audio (dialogue/SFX). */
  audio: boolean
  /** Model-specific aspect_ratio values. */
  aspectRatios: { landscape: string; portrait: string }
}

const LANDSCAPE = '16:9'
const PORTRAIT = '9:16'

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'fal-ai/veo3.1/image-to-video',
    label: 'Veo 3.1',
    description: 'Highest quality dialogue + lip-sync. Priciest.',
    pricePerSec: 0.4,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'fal-ai/veo3.1/fast/image-to-video',
    label: 'Veo 3.1 Fast',
    description: 'Veo audio quality, faster and cheaper.',
    pricePerSec: 0.25,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'bytedance/seedance-2.0/image-to-video',
    label: 'Seedance 2.0',
    description: 'Balanced quality + native audio, keeps the input image.',
    pricePerSec: 0.3,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'bytedance/seedance-2.0/fast/image-to-video',
    label: 'Seedance 2.0 Fast',
    description: 'Cheapest with audio. Fast turnaround.',
    pricePerSec: 0.24,
    maxDurationSec: 8,
    audio: true,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    label: 'Kling v3 Pro (silent)',
    description: 'Longer clips (≤15s), strong motion — no audio.',
    pricePerSec: 0.1,
    maxDurationSec: 15,
    audio: false,
    aspectRatios: { landscape: LANDSCAPE, portrait: PORTRAIT },
  },
]

export const DEFAULT_VIDEO_MODEL: VideoModelId = 'bytedance/seedance-2.0/image-to-video'

export function getVideoModel(id: string): VideoModel {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
}

export interface NativeVideoArgs {
  model: VideoModelId
  prompt: string
  startImageUrl: string
  durationSec?: number
  aspect?: 'landscape' | 'portrait'
  /** Force silent output (no audio) regardless of the model's default. */
  forceSilent?: boolean
}

/** veo3.1's `duration` field is a string enum of exactly these second counts. */
const VEO_DURATION_STEPS = [4, 6, 8] as const

/**
 * Build the fal input for one video model. Field names/formats confirmed against each
 * model's fal API docs (see task-1-report.md):
 * - veo3.1 (both tiers): `image_url` + `duration` as `"4s"|"6s"|"8s"` + `resolution` + `aspect_ratio` + `generate_audio`.
 * - seedance-2.0 (both tiers): `image_url` + `duration` as a plain numeric string (e.g. `"8"`) + `resolution` + `aspect_ratio` + `generate_audio`.
 * - kling v3 pro: `start_image_url` + `duration` as a plain numeric string; no `resolution` field
 *   (aspect_ratio is accepted but the model infers it from the input image); audio forced off.
 */
export function buildVideoInput(model: VideoModel, args: Omit<NativeVideoArgs, 'model'>): Record<string, unknown> {
  const aspect = model.aspectRatios[args.aspect ?? 'landscape']
  const requested = args.durationSec ?? 8

  if (model.id === 'fal-ai/kling-video/v3/pro/image-to-video') {
    const seconds = Math.min(model.maxDurationSec, Math.max(3, Math.round(requested)))
    return {
      prompt: args.prompt,
      start_image_url: args.startImageUrl,
      duration: String(seconds),
      aspect_ratio: aspect,
      generate_audio: args.forceSilent ? false : model.audio,
    }
  }

  if (model.id.startsWith('fal-ai/veo3.1')) {
    const clamped = Math.min(model.maxDurationSec, Math.max(3, Math.round(requested)))
    const seconds = VEO_DURATION_STEPS.reduce((best, v) =>
      Math.abs(v - clamped) < Math.abs(best - clamped) ? v : best,
    )
    return {
      prompt: args.prompt,
      image_url: args.startImageUrl,
      duration: `${seconds}s`,
      aspect_ratio: aspect,
      resolution: '720p',
      generate_audio: args.forceSilent ? false : model.audio,
    }
  }

  // bytedance/seedance-2.0 (base + fast)
  const seconds = Math.min(model.maxDurationSec, Math.max(4, Math.round(requested)))
  return {
    prompt: args.prompt,
    image_url: args.startImageUrl,
    duration: String(seconds),
    aspect_ratio: aspect,
    resolution: '720p',
    generate_audio: args.forceSilent ? false : model.audio,
  }
}

interface VideoOutput {
  video: { url: string; content_type?: string; file_name?: string; file_size?: number }
}

/** Generate one image-to-video clip on the selected model. Audio embedded when the model supports it. */
export async function nativeVideo(args: NativeVideoArgs, opts: RunOptions = {}): Promise<{ url: string }> {
  const model = getVideoModel(args.model)
  const input = buildVideoInput(model, args)
  const { data } = await run<VideoOutput>(model.id, input, { timeoutMs: TIMEOUTS.video, ...opts })
  return { url: data.video.url }
}
