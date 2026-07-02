/** A reusable character reference image, hosted on the fal CDN. */
export interface CharacterImage {
  id: string
  name: string
  url: string
  source: 'minted' | 'uploaded'
  createdAt: number
}

/** A character the LLM plans for the story. */
export interface Character {
  name: string
  /** Visual description for the character reference image (age, build, hair, clothing, art style). */
  appearance: string
  /** Short voice description embedded in each shot prompt for audio-capable models (best-effort consistency). */
  voice: string
}

/** One generatable unit: a single ≤8s video shot. */
export interface Scene {
  id: string
  title: string
  /** Character names on screen / speaking in this shot (≤3), in @Element / dialogue order. */
  speakers: string[]
  /** Shot description: setting, framing, camera move, lighting, action. */
  visual: string
  /** Spoken lines for this shot; empty for a silent/atmospheric shot. */
  dialogue: string
}

export interface Plan {
  category: string
  characters: Character[]
  scenes: Scene[]
}

export type ClipStatus = 'pending' | 'running' | 'done' | 'error'

/** A generated shot, one per scene: a video clip (with embedded audio when the model supports it). */
export interface Clip {
  id: string
  sceneId: string
  title: string
  speakers: string[]
  /** Composed prompt sent to the video model (for display). */
  prompt: string
  /** Scene keyframe used as the i2v start frame. */
  imageUrl?: string
  /** Final video clip URL. */
  videoUrl?: string
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
  /** Video output orientation. */
  aspect: 'landscape' | 'portrait'
}

/** A saved run: brief + plan + results, persisted in localStorage and listed in the sidebar. */
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  brief: Brief
  plan: Plan | null
  category: string | null
  clips: Clip[]
  /** Video model id used for this run. */
  videoModel: string
}
