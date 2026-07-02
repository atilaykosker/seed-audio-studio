import type { Brief, Plan, BiographyPlan } from '../../lib/types'

export interface SessionRow {
  id: string
  title: string
  brief: Brief
  plan: Plan | null
  bio_plan: BiographyPlan | null
  category: string | null
  video_model: string
  created_at: string
  updated_at: string
}
export type SessionInsert = Omit<SessionRow, 'id' | 'created_at' | 'updated_at'>

export interface ClipRow {
  id: string
  session_id: string
  scene_id: string
  title: string
  speakers: string[]
  prompt: string
  status: 'pending' | 'running' | 'done' | 'error'
  phase: 'queued' | 'running' | 'done' | null
  request_id: string | null
  request_endpoint: string | null
  image_key: string | null
  video_key: string | null
  duration_sec: number | null
  error: string | null
  created_at: string
}
export type ClipInsert = Omit<ClipRow, 'id' | 'created_at'>

export interface CharacterRow {
  id: string
  name: string
  image_key: string
  source: 'minted' | 'uploaded'
  request_id: string | null
  status: 'queued' | 'done' | 'error'
  created_at: string
}
export type CharacterInsert = Omit<CharacterRow, 'id' | 'created_at'>
