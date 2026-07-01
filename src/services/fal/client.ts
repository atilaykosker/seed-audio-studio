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
  seedAudio: 300_000,
  image: 180_000,
  video: 600_000, // kling video legitimately takes minutes
} as const

/** Upload a blob/file to fal's CDN, returning a hosted URL usable as model input. */
export async function uploadAsset(blob: Blob): Promise<string> {
  return fal.storage.upload(blob)
}

export const ENDPOINTS = {
  /** Multi-voice / single-voice TTS with native SFX + ambience. */
  seedAudio: 'bytedance/seed-audio-1.0',
  /** fal's OpenRouter gateway for LLM planning/categorization. */
  llm: 'openrouter/router',
  /** Text-to-image for character references / scene keyframes. */
  nanoBanana: 'fal-ai/nano-banana',
  /** Image-conditioned edit variant (compose characters into a keyframe). */
  nanoBananaEdit: 'fal-ai/nano-banana/edit',
  /** Image-to-video with custom elements for cross-clip consistency. */
  klingVideo: 'fal-ai/kling-video/v3/pro/image-to-video',
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

export interface SeedAudioOutput {
  audio: { url: string; duration?: number; content_type?: string }
}

/** Generate one seed-audio clip. T2A (no refs) or TA2A (audio_urls ≤3, referenced @Audio1..3). */
export async function seedAudio(
  args: {
    prompt: string
    audioUrls?: string[]
    sampleRate?: number
    outputFormat?: 'wav' | 'mp3'
  },
  opts: RunOptions = {},
): Promise<{ url: string; duration: number }> {
  const input: Record<string, unknown> = {
    prompt: args.prompt,
    sample_rate: args.sampleRate ?? 44100,
    output_format: args.outputFormat ?? 'wav',
  }
  if (args.audioUrls && args.audioUrls.length) input.audio_urls = args.audioUrls
  const { data } = await run<SeedAudioOutput>(ENDPOINTS.seedAudio, input, { timeoutMs: TIMEOUTS.seedAudio, ...opts })
  return { url: data.audio.url, duration: data.audio.duration ?? 0 }
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

export interface KlingElement {
  frontal_image_url: string
  reference_image_urls?: string[]
}

interface KlingVideoOutput {
  video: { url: string; content_type?: string; file_name?: string; file_size?: number }
}

/** Generate one kling v3 image-to-video clip. Audio disabled; duration clamped to [3,15]. */
export async function klingVideo(
  args: { prompt: string; startImageUrl: string; durationSec?: number; elements?: KlingElement[] },
  opts: RunOptions = {},
): Promise<{ url: string }> {
  const duration = String(Math.min(15, Math.max(3, Math.round(args.durationSec ?? 5))))
  const input: Record<string, unknown> = {
    prompt: args.prompt,
    start_image_url: args.startImageUrl,
    duration,
    generate_audio: false,
  }
  if (args.elements && args.elements.length) input.elements = args.elements.slice(0, 3)
  const { data } = await run<KlingVideoOutput>(ENDPOINTS.klingVideo, input, { timeoutMs: TIMEOUTS.video, ...opts })
  return { url: data.video.url }
}
