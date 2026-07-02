// src/server/db/characters.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CharacterImage } from '../../lib/types'
import type { CharacterRow } from './rows'
import { characterToInsert } from './mappers'

export async function upsertCharacter(db: SupabaseClient, c: CharacterImage, imageKey: string): Promise<CharacterRow> {
  const { data, error } = await db
    .from('character_library')
    .upsert(characterToInsert(c, imageKey), { onConflict: 'name_normalized' })
    .select('*')
    .single()
  if (error) throw error
  return data as CharacterRow
}

export async function listCharacters(db: SupabaseClient): Promise<CharacterRow[]> {
  const { data, error } = await db.from('character_library').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CharacterRow[]
}

export async function deleteCharacter(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('character_library').delete().eq('id', id)
  if (error) throw error
}

export async function insertPendingCharacter(db: SupabaseClient, c: CharacterImage, requestId: string): Promise<CharacterRow> {
  const { data, error } = await db
    .from('character_library')
    .insert({ ...characterToInsert(c, ''), request_id: requestId, status: 'queued' })
    .select('*')
    .single()
  if (error) throw error
  return data as CharacterRow
}

export async function finishCharacter(db: SupabaseClient, id: string, imageKey: string): Promise<void> {
  const { error } = await db
    .from('character_library')
    .update({ image_key: imageKey, status: 'done', request_id: null })
    .eq('id', id)
  if (error) throw error
}

export async function getCharacter(db: SupabaseClient, id: string): Promise<CharacterRow | null> {
  const { data, error } = await db.from('character_library').select('*').eq('id', id).single()
  if (error && (error as { code?: string }).code !== 'PGRST116') throw error
  return (data as CharacterRow) ?? null
}
