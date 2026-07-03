// src/server/db/sessions.ts
import type { D1Database } from '@cloudflare/workers-types'
import type { Session, Clip } from '../../lib/types'
import type { SessionRow } from './rows'
import { rowToSession } from './mappers'

interface RawSessionRow { id: string; title: string; brief: string; plan: string | null; bio_plan: string | null; category: string | null; video_model: string; created_at: string; updated_at: string }
function parseSession(r: RawSessionRow): SessionRow {
  return { ...r, brief: JSON.parse(r.brief), plan: r.plan ? JSON.parse(r.plan) : null, bio_plan: r.bio_plan ? JSON.parse(r.bio_plan) : null }
}

export async function createSession(db: D1Database, s: Session): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(
    'insert into sessions (id,title,brief,plan,bio_plan,category,video_model,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
  ).bind(id, s.title, JSON.stringify(s.brief), s.plan ? JSON.stringify(s.plan) : null, s.bioPlan ? JSON.stringify(s.bioPlan) : null, s.category, s.videoModel, now, now).run()
  return id
}

export async function getSession(db: D1Database, id: string, clips: Clip[]): Promise<Session | null> {
  const raw = await db.prepare('select * from sessions where id = ?').bind(id).first<RawSessionRow>()
  if (!raw) return null
  return rowToSession(parseSession(raw), clips)
}

export async function getSessionRow(db: D1Database, id: string): Promise<SessionRow | null> {
  const raw = await db.prepare('select * from sessions where id = ?').bind(id).first<RawSessionRow>()
  if (!raw) return null
  return parseSession(raw)
}

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>
export async function listSessions(db: D1Database): Promise<SessionSummary[]> {
  const { results } = await db.prepare('select id,title,category,video_model,created_at,updated_at from sessions order by updated_at desc, rowid desc').all<Pick<RawSessionRow, 'id' | 'title' | 'category' | 'video_model' | 'created_at' | 'updated_at'>>()
  return results.map((r) => ({ id: r.id, title: r.title, category: r.category, videoModel: r.video_model, createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at) }))
}

export async function renameSession(db: D1Database, id: string, title: string): Promise<void> {
  await db.prepare('update sessions set title = ?, updated_at = ? where id = ?').bind(title, new Date().toISOString(), id).run()
}
export async function deleteSession(db: D1Database, id: string): Promise<void> {
  await db.prepare('delete from sessions where id = ?').bind(id).run()
}
