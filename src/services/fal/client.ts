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

export interface RunOptions {
  onProgress?: (phase: QueuePhase, position?: number) => void
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
  const res = await fal.subscribe(endpointId, {
    input,
    logs: false,
    onQueueUpdate: (u: QueueUpdate) => {
      if (u.status === 'IN_QUEUE') opts.onProgress?.('queued', u.queue_position)
      else if (u.status === 'IN_PROGRESS') opts.onProgress?.('running')
      else if (u.status === 'COMPLETED') opts.onProgress?.('done')
    },
  })
  return { data: res.data as T, requestId: res.requestId }
}

/** Upload a blob/file to fal's CDN, returning a hosted URL usable as model input. */
export async function uploadAsset(blob: Blob): Promise<string> {
  return fal.storage.upload(blob)
}

export const ENDPOINTS = {
  /** Multi-voice / single-voice TTS with native SFX + ambience. */
  seedAudio: 'bytedance/seed-audio-1.0',
  /** fal's OpenRouter gateway for LLM planning/categorization. */
  llm: 'openrouter/router',
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
    opts,
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
  const { data } = await run<SeedAudioOutput>(ENDPOINTS.seedAudio, input, opts)
  return { url: data.audio.url, duration: data.audio.duration ?? 0 }
}
