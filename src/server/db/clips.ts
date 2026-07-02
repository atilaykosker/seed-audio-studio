// src/server/db/clips.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Clip } from '../../lib/types'
import type { ClipRow } from './rows'
import { clipToInsert } from './mappers'

export async function insertClips(db: SupabaseClient, sessionId: string, clips: Clip[]): Promise<ClipRow[]> {
  const { data, error } = await db.from('clips').insert(clips.map((c) => clipToInsert(sessionId, c))).select('*')
  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export async function listClipsBySession(db: SupabaseClient, sessionId: string): Promise<ClipRow[]> {
  const { data, error } = await db.from('clips').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export interface ClipPatch {
  status?: ClipRow['status']
  phase?: ClipRow['phase']
  request_id?: string | null
  request_endpoint?: string | null
  image_key?: string | null
  video_key?: string | null
  duration_sec?: number | null
  error?: string | null
}

export async function updateClipStatus(db: SupabaseClient, id: string, patch: ClipPatch): Promise<void> {
  const { error } = await db.from('clips').update(patch).eq('id', id)
  if (error) throw error
}

export async function getClip(db: SupabaseClient, id: string): Promise<ClipRow | null> {
  const { data, error } = await db.from('clips').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  return (data as ClipRow) ?? null
}

export async function getClipBySceneId(db: SupabaseClient, sessionId: string, sceneId: string): Promise<ClipRow | null> {
  const { data, error } = await db
    .from('clips')
    .select('*')
    .eq('session_id', sessionId)
    .eq('scene_id', sceneId)
    .single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  return (data as ClipRow) ?? null
}
