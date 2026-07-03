// src/server/api/assemble.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { Session, CharacterImage } from '../../lib/types'
import type { S3 } from '../storage/s3'
import { getSessionRow } from '../db/sessions'
import { listClipsBySession } from '../db/clips'
import { listCharacters } from '../db/characters'
import { rowToSession, rowToClip, rowToCharacter } from '../db/mappers'

type Presigner = Pick<S3, 'presignGet'>

export async function assembleSession(db: D1Database, s3: Presigner, id: string): Promise<Session | null> {
  const row = await getSessionRow(db, id)
  if (!row) return null
  const clipRows = await listClipsBySession(db, id)
  const clips = await Promise.all(
    clipRows.map(async (c) => {
      const imageUrl = c.image_key ? await s3.presignGet(c.image_key) : undefined
      const videoUrl = c.video_key ? await s3.presignGet(c.video_key) : undefined
      return rowToClip(c, { imageUrl, videoUrl })
    }),
  )
  return rowToSession(row, clips)
}

export async function assembleCharacters(db: D1Database, s3: Presigner): Promise<CharacterImage[]> {
  const rows = await listCharacters(db)
  return Promise.all(rows.map(async (r) => rowToCharacter(r, r.image_key ? await s3.presignGet(r.image_key) : '')))
}
