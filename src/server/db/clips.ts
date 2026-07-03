// src/server/db/clips.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { Clip } from '../../lib/types'
import type { ClipRow } from './rows'
import { clipToInsert } from './mappers'

interface RawClipRow {
  id: string
  session_id: string
  scene_id: string
  title: string
  speakers: string
  prompt: string
  status: ClipRow['status']
  phase: ClipRow['phase']
  request_id: string | null
  request_endpoint: string | null
  image_key: string | null
  video_key: string | null
  duration_sec: number | null
  error: string | null
  created_at: string
}
function parseClip(r: RawClipRow): ClipRow {
  return { ...r, speakers: JSON.parse(r.speakers) as string[] }
}

export async function insertClips(db: D1Database, sessionId: string, clips: Clip[]): Promise<ClipRow[]> {
  const out: ClipRow[] = []
  for (const c of clips) {
    const insert = clipToInsert(sessionId, c)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db
      .prepare(
        'insert into clips (id,session_id,scene_id,title,speakers,prompt,status,phase,image_key,video_key,duration_sec,error,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        insert.session_id,
        insert.scene_id,
        insert.title,
        JSON.stringify(insert.speakers),
        insert.prompt,
        insert.status,
        insert.phase,
        insert.image_key,
        insert.video_key,
        insert.duration_sec,
        insert.error,
        now,
      )
      .run()
    out.push({
      id,
      session_id: insert.session_id,
      scene_id: insert.scene_id,
      title: insert.title,
      speakers: insert.speakers,
      prompt: insert.prompt,
      status: insert.status,
      phase: insert.phase,
      request_id: null,
      request_endpoint: null,
      image_key: insert.image_key,
      video_key: insert.video_key,
      duration_sec: insert.duration_sec,
      error: insert.error,
      created_at: now,
    })
  }
  return out
}

export async function listClipsBySession(db: D1Database, sessionId: string): Promise<ClipRow[]> {
  const { results } = await db
    .prepare('select * from clips where session_id = ? order by created_at asc, rowid asc')
    .bind(sessionId)
    .all<RawClipRow>()
  return results.map(parseClip)
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

export async function updateClipStatus(db: D1Database, id: string, patch: ClipPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ')
  const values = entries.map(([, v]) => v)
  await db
    .prepare(`update clips set ${setClause} where id = ?`)
    .bind(...values, id)
    .run()
}

export async function getClip(db: D1Database, id: string): Promise<ClipRow | null> {
  const raw = await db.prepare('select * from clips where id = ?').bind(id).first<RawClipRow>()
  if (!raw) return null
  return parseClip(raw)
}

export async function getClipBySceneId(db: D1Database, sessionId: string, sceneId: string): Promise<ClipRow | null> {
  const raw = await db
    .prepare('select * from clips where session_id = ? and scene_id = ?')
    .bind(sessionId, sceneId)
    .first<RawClipRow>()
  if (!raw) return null
  return parseClip(raw)
}
