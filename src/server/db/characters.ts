// src/server/db/characters.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { CharacterImage } from '../../lib/types'
import type { CharacterRow, CharacterInsert } from './rows'
import { characterToInsert } from './mappers'

async function upsertRow(db: D1Database, insert: CharacterInsert): Promise<CharacterRow> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `insert into character_library (id,name,image_key,source,request_id,status,created_at)
       values (?,?,?,?,?,?,?)
       on conflict(name_normalized) do update set
         image_key = excluded.image_key,
         source = excluded.source,
         status = excluded.status,
         request_id = excluded.request_id`,
    )
    .bind(id, insert.name, insert.image_key, insert.source, insert.request_id, insert.status, now)
    .run()
  const row = await db
    .prepare('select * from character_library where name_normalized = lower(?)')
    .bind(insert.name)
    .first<CharacterRow>()
  if (!row) throw new Error('character upsert failed to read back the row')
  return row
}

export async function upsertCharacter(db: D1Database, c: CharacterImage, imageKey: string): Promise<CharacterRow> {
  return upsertRow(db, characterToInsert(c, imageKey))
}

export async function insertPendingCharacter(db: D1Database, c: CharacterImage, requestId: string): Promise<CharacterRow> {
  // Upsert on name_normalized: character_library has a unique index on lower(name), so a
  // repeated/retried/reused character name must reset the existing row rather than collide.
  return upsertRow(db, { ...characterToInsert(c, ''), request_id: requestId, status: 'queued' })
}

export async function finishCharacter(db: D1Database, id: string, imageKey: string): Promise<void> {
  await db
    .prepare("update character_library set image_key = ?, status = 'done', request_id = null where id = ?")
    .bind(imageKey, id)
    .run()
}

export async function setCharacterError(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("update character_library set status = 'error', request_id = null where id = ?")
    .bind(id)
    .run()
}

export async function getCharacter(db: D1Database, id: string): Promise<CharacterRow | null> {
  const row = await db.prepare('select * from character_library where id = ?').bind(id).first<CharacterRow>()
  return row ?? null
}

export async function listCharacters(db: D1Database): Promise<CharacterRow[]> {
  const { results } = await db
    .prepare('select * from character_library order by created_at asc, rowid asc')
    .all<CharacterRow>()
  return results
}

export async function deleteCharacter(db: D1Database, id: string): Promise<void> {
  await db.prepare('delete from character_library where id = ?').bind(id).run()
}
