import { llmText, type RunOptions } from '@/services/fal/client'
import type { Brief, Plan, Scene } from '@/lib/types'
import { uid } from '@/lib/utils'
import { DIRECTOR_GUIDE, OUTPUT_DIRECTIVE } from './guide'

export function buildPlanPrompt(b: Brief): string {
  const speakers =
    b.speakers === 'auto'
      ? 'Choose a sensible number of distinct characters.'
      : `Use about ${b.speakers} distinct character(s).`
  const genre = b.genre.trim() ? `Genre/style hint: ${b.genre.trim()}.` : ''
  return [
    `Brief: ${b.idea.trim()}`,
    `Target total length: about ${b.durationSec} seconds (split into ≤8s shots).`,
    `Language for spoken dialogue: ${b.language === 'ZH' ? 'Chinese' : 'English'}.`,
    `Orientation: ${b.aspect === 'portrait' ? 'portrait (9:16)' : 'landscape (16:9)'}.`,
    speakers,
    genre,
    `Plan the characters and the shots needed to realize this, following all the rules. Categorize it.`,
  ]
    .filter(Boolean)
    .join('\n')
}

interface RawPlan {
  category?: string
  characters?: { name?: string; appearance?: string; voice?: string }[]
  scenes?: { title?: string; speakers?: string[]; visual?: string; dialogue?: string }[]
}

/** Pull the first balanced JSON object out of an LLM response (tolerates fences/prose). */
function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in LLM output.')
  return t.slice(start, end + 1)
}

export function parsePlan(text: string): Plan {
  const raw = JSON.parse(extractJson(text)) as RawPlan
  if (!Array.isArray(raw.characters) || !Array.isArray(raw.scenes)) {
    throw new Error('LLM plan missing characters/scenes.')
  }
  const characters = raw.characters
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name!.trim(),
      appearance: (c.appearance ?? '').trim(),
      voice: (c.voice ?? '').trim(),
    }))
  const scenes: Scene[] = raw.scenes
    .filter((s) => s.visual || s.dialogue)
    .map((s) => ({
      id: uid(),
      title: (s.title ?? 'Shot').trim(),
      speakers: (s.speakers ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
      visual: (s.visual ?? '').trim(),
      dialogue: (s.dialogue ?? '').trim(),
    }))
  if (!scenes.length) throw new Error('LLM plan has no scenes.')
  return { category: (raw.category ?? 'Other').trim(), characters, scenes }
}

/** Call the LLM and parse a Plan. Retries once with a stricter nudge on parse failure. */
export async function makePlan(brief: Brief, model: string, opts: RunOptions = {}): Promise<Plan> {
  const userPrompt = buildPlanPrompt(brief)
  const systemBase = DIRECTOR_GUIDE + OUTPUT_DIRECTIVE
  const attempt = async (extra = '') =>
    parsePlan(
      await llmText(
        { systemPrompt: systemBase + extra, prompt: userPrompt, model, temperature: 0.7, maxTokens: 3500 },
        opts,
      ),
    )
  try {
    return await attempt()
  } catch {
    return await attempt('\n\nIMPORTANT: Output MUST be valid JSON only — no prose, no code fences.')
  }
}
