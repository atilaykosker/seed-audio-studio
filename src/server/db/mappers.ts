// src/server/db/mappers.ts
import type { Session, Clip, CharacterImage } from '../../lib/types'
import type { SessionRow, SessionInsert, ClipRow, ClipInsert, CharacterRow, CharacterInsert } from './rows'

export function sessionToInsert(s: Session): SessionInsert {
  return {
    title: s.title,
    brief: s.brief,
    plan: s.plan,
    bio_plan: s.bioPlan,
    category: s.category,
    video_model: s.videoModel,
  }
}

export function rowToSession(row: SessionRow, clips: Clip[]): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    brief: row.brief,
    plan: row.plan,
    bioPlan: row.bio_plan,
    category: row.category,
    clips,
    videoModel: row.video_model,
  }
}

export function clipToInsert(sessionId: string, c: Clip): ClipInsert {
  return {
    session_id: sessionId,
    scene_id: c.sceneId,
    title: c.title,
    speakers: c.speakers,
    prompt: c.prompt,
    status: c.status,
    phase: c.phase ?? null,
    request_id: null,
    request_endpoint: null,
    image_key: null,
    video_key: null,
    duration_sec: c.durationSec ?? null,
    error: c.error ?? null,
  }
}

export function rowToClip(row: ClipRow, media: { imageUrl?: string; videoUrl?: string }): Clip {
  return {
    id: row.id,
    sceneId: row.scene_id,
    title: row.title,
    speakers: row.speakers,
    prompt: row.prompt,
    status: row.status,
    phase: row.phase ?? undefined,
    imageUrl: media.imageUrl,
    videoUrl: media.videoUrl,
    durationSec: row.duration_sec == null ? undefined : Number(row.duration_sec),
    error: row.error ?? undefined,
  }
}

export function characterToInsert(c: CharacterImage, imageKey: string): CharacterInsert {
  return {
    name: c.name,
    image_key: imageKey,
    source: c.source,
    request_id: null,
    status: 'done',
  }
}

export function rowToCharacter(row: CharacterRow, url: string): CharacterImage {
  return {
    id: row.id,
    name: row.name,
    url,
    source: row.source,
    createdAt: Date.parse(row.created_at),
  }
}
