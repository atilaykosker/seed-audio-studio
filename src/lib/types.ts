/** A reusable character voice: minted via T2A or uploaded, hosted on fal CDN. */
export interface Voice {
  id: string
  name: string
  voiceSpec: string
  url: string
  durationSec: number
  source: 'minted' | 'uploaded'
  createdAt: number
}

/** A character the LLM plans for the scene (before its voice is minted). */
export interface Character {
  name: string
  /** Short attribute spec, e.g. "male, 30s, British, warm baritone, dry wit". */
  voiceSpec: string
  /** ~55-70 word one-mood T2A monologue used to mint the reference clip. */
  refPrompt: string
}

/** One generatable unit: a single seed-audio call. */
export interface Scene {
  id: string
  kind: 'T2A' | 'TA2A'
  title: string
  /** Character names that speak in this scene (TA2A: order maps to @Audio1..3, ≤3). */
  speakers: string[]
  /** Full seed-audio prompt (already tagged + SFX/atmosphere baked in). */
  prompt: string
}

export interface Plan {
  category: string
  characters: Character[]
  scenes: Scene[]
}

export type ClipStatus = 'pending' | 'minting' | 'running' | 'done' | 'error'

/** A generated audio result, one per scene. */
export interface Clip {
  id: string
  sceneId: string
  title: string
  kind: 'T2A' | 'TA2A'
  speakers: string[]
  prompt: string
  url?: string
  durationSec?: number
  status: ClipStatus
  phase?: 'queued' | 'running' | 'done'
  error?: string
}

export type StudioStatus = 'idle' | 'planning' | 'generating' | 'done' | 'error'

export interface Brief {
  idea: string
  durationSec: number
  language: 'EN' | 'ZH'
  speakers: 'auto' | 1 | 2 | 3
  genre: string
  /** Library voice ids the user pinned as reference samples for this generation. */
  voiceIds: string[]
}
