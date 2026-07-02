// src/server/db/sessions.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Session, Clip } from '../../lib/types'
import type { SessionRow } from './rows'
import { sessionToInsert, rowToSession } from './mappers'

export async function createSession(db: SupabaseClient, s: Session): Promise<string> {
  const { data, error } = await db.from('sessions').insert(sessionToInsert(s)).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function getSession(db: SupabaseClient, id: string, clips: Clip[]): Promise<Session | null> {
  const { data, error } = await db.from('sessions').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  if (!data) return null
  return rowToSession(data as SessionRow, clips)
}

export async function getSessionRow(db: SupabaseClient, id: string): Promise<SessionRow | null> {
  const { data, error } = await db.from('sessions').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  return (data as SessionRow) ?? null
}

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>

export async function listSessions(db: SupabaseClient): Promise<SessionSummary[]> {
  const { data, error } = await db
    .from('sessions')
    .select('id,title,category,video_model,created_at,updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as Pick<SessionRow, 'id' | 'title' | 'category' | 'video_model' | 'created_at' | 'updated_at'>
    return {
      id: row.id, title: row.title, category: row.category, videoModel: row.video_model,
      createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at),
    }
  })
}

export async function renameSession(db: SupabaseClient, id: string, title: string): Promise<void> {
  const { error } = await db.from('sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteSession(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('sessions').delete().eq('id', id)
  if (error) throw error
}
