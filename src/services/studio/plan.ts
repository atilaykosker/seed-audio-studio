import { llmText, type RunOptions } from '@/services/fal/client'
import type { Brief, Plan, Scene, Voice } from '@/lib/types'
import { uid } from '@/lib/utils'
import { SEED_AUDIO_GUIDE, OUTPUT_DIRECTIVE } from './guide'

export function buildPlanPrompt(b: Brief, provided: Voice[] = []): string {
  const speakers =
    b.speakers === 'auto' ? 'Choose a sensible number of distinct speakers.' : `Use about ${b.speakers} distinct speaker(s).`
  const genre = b.genre.trim() ? `Genre/style hint: ${b.genre.trim()}.` : ''
  const providedBlock = provided.length
    ? [
        'The user has supplied these reference voice samples. You MUST cast each one as a character, using its EXACT name below (do not invent a replacement voice for it). Build the story around them; add at most a few more characters only if the scene needs them:',
        ...provided.map((v) => `- ${v.name}: ${v.voiceSpec || 'a user-provided voice sample'}`),
      ].join('\n')
    : ''
  return [
    `Brief: ${b.idea.trim()}`,
    `Target total length: about ${b.durationSec} seconds.`,
    `Language: ${b.language === 'ZH' ? 'Chinese' : 'English'}.`,
    speakers,
    genre,
    providedBlock,
    `Plan the characters and the scene(s) needed to realize this, following all the rules. Categorize it and weave in fitting SFX/atmosphere/music.`,
  ]
    .filter(Boolean)
    .join('\n')
}

interface RawPlan {
  category?: string
  characters?: { name?: string; voiceSpec?: string; refPrompt?: string }[]
  scenes?: { kind?: string; title?: string; speakers?: string[]; prompt?: string }[]
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
    .filter((c) => c.name && c.refPrompt)
    .map((c) => ({ name: c.name!.trim(), voiceSpec: (c.voiceSpec ?? '').trim(), refPrompt: c.refPrompt!.trim() }))
  const scenes: Scene[] = raw.scenes
    .filter((s) => s.prompt)
    .map((s) => ({
      id: uid(),
      kind: s.kind === 'T2A' ? 'T2A' : 'TA2A',
      title: (s.title ?? 'Scene').trim(),
      speakers: (s.speakers ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
      prompt: s.prompt!.trim(),
    }))
  if (!scenes.length) throw new Error('LLM plan has no scenes.')
  return { category: (raw.category ?? 'Other').trim(), characters, scenes }
}

/** Call the LLM and parse a Plan. Retries once with a stricter nudge on parse failure. */
export async function makePlan(
  brief: Brief,
  model: string,
  provided: Voice[] = [],
  opts: RunOptions = {},
): Promise<Plan> {
  const userPrompt = buildPlanPrompt(brief, provided)
  const attempt = async (extra = '') =>
    parsePlan(
      await llmText(
        {
          systemPrompt: SEED_AUDIO_GUIDE + OUTPUT_DIRECTIVE + extra,
          prompt: userPrompt,
          model,
          temperature: 0.7,
          maxTokens: 3500,
        },
        opts,
      ),
    )
  try {
    return await attempt()
  } catch {
    return await attempt('\n\nIMPORTANT: Output MUST be valid JSON only — no prose, no code fences.')
  }
}
