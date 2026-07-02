// src/server/db/mappers.test.ts
import { describe, it, expect } from 'vitest'
import { sessionToInsert, rowToSession, clipToInsert, rowToClip, characterToInsert, rowToCharacter } from './mappers'
import type { Session, Clip, CharacterImage } from '../../lib/types'

const brief: Session['brief'] = {
  idea: 'a robot learns to paint', durationSec: 24, language: 'EN', speakers: 'auto',
  genre: 'drama', aspect: 'landscape', type: 'story', shotSec: 8,
}

describe('session mappers', () => {
  it('sessionToInsert copies scalar + jsonb fields, drops clips/ids/timestamps', () => {
    const s: Session = {
      id: 'x', title: 'My run', createdAt: 1, updatedAt: 2, brief,
      plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null,
      category: 'Drama', clips: [], videoModel: 'bytedance/seedance-2.0/image-to-video',
    }
    const ins = sessionToInsert(s)
    expect(ins).toEqual({
      title: 'My run', brief, plan: s.plan, bio_plan: null, category: 'Drama',
      video_model: 'bytedance/seedance-2.0/image-to-video',
    })
    expect('clips' in ins).toBe(false)
    expect('id' in ins).toBe(false)
  })

  it('rowToSession reattaches clips and converts timestamps to epoch numbers', () => {
    const row = {
      id: 'sid', title: 'T', brief, plan: null,
      bio_plan: { subject: 'Ada', style: 'watercolor', stages: [], pages: [] },
      category: 'Biography', video_model: 'm',
      created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:01.000Z',
    }
    const clips: Clip[] = [{ id: 'c1', sceneId: 's1', title: 'Shot', speakers: [], prompt: 'p', status: 'done' }]
    const s = rowToSession(row, clips)
    expect(s.id).toBe('sid')
    expect(s.bioPlan?.subject).toBe('Ada')
    expect(s.clips).toBe(clips)
    expect(s.createdAt).toBe(Date.parse('2026-07-02T00:00:00.000Z'))
    expect(s.updatedAt).toBe(Date.parse('2026-07-02T00:00:01.000Z'))
  })
})

describe('clip mappers', () => {
  it('clipToInsert maps fields and sets keys null by default', () => {
    const c: Clip = { id: 'c', sceneId: 'sc', title: 'Scene 1', speakers: ['A', 'B'], prompt: 'do a thing', status: 'pending' }
    const ins = clipToInsert('sid', c)
    expect(ins).toMatchObject({
      session_id: 'sid', scene_id: 'sc', title: 'Scene 1', speakers: ['A', 'B'],
      prompt: 'do a thing', status: 'pending', image_key: null, video_key: null,
    })
  })

  it('rowToClip injects presigned media URLs from the API layer', () => {
    const row = {
      id: 'c', session_id: 'sid', scene_id: 'sc', title: 'Scene 1', speakers: [], prompt: 'p',
      status: 'done' as const, phase: 'done' as const, request_id: null, request_endpoint: null,
      image_key: 'k1.png', video_key: 'k2.mp4', duration_sec: 8, error: null, created_at: 'x',
    }
    const c = rowToClip(row, { imageUrl: 'https://s3/k1.png?sig', videoUrl: 'https://s3/k2.mp4?sig' })
    expect(c.videoUrl).toBe('https://s3/k2.mp4?sig')
    expect(c.imageUrl).toBe('https://s3/k1.png?sig')
    expect(c.durationSec).toBe(8)
    expect(c.status).toBe('done')
  })

  it('rowToClip maps null phase/error/duration_sec to undefined', () => {
    const row = {
      id: 'c', session_id: 'sid', scene_id: 'sc', title: 'Scene 1', speakers: [], prompt: 'p',
      status: 'pending' as const, phase: null, request_id: null, request_endpoint: null,
      image_key: null, video_key: null, duration_sec: null, error: null, created_at: 'x',
    }
    const c = rowToClip(row, {})
    expect(c.phase).toBeUndefined()
    expect(c.error).toBeUndefined()
    expect(c.durationSec).toBeUndefined()
  })
})

describe('character mappers', () => {
  it('characterToInsert stores the S3 key and lowercased-reuse name', () => {
    const ch: CharacterImage = { id: 'i', name: 'Robot', url: 'https://fal/x', source: 'minted', createdAt: 5 }
    const ins = characterToInsert(ch, 'characters/i.png')
    expect(ins).toMatchObject({ name: 'Robot', image_key: 'characters/i.png', source: 'minted' })
  })

  it('rowToCharacter injects the presigned url', () => {
    const row = { id: 'i', name: 'Robot', image_key: 'characters/i.png', source: 'minted' as const, request_id: null, status: 'done' as const, created_at: '2026-07-02T00:00:00.000Z' }
    const ch = rowToCharacter(row, 'https://s3/characters/i.png?sig')
    expect(ch.url).toBe('https://s3/characters/i.png?sig')
    expect(ch.name).toBe('Robot')
    expect(ch.createdAt).toBe(Date.parse('2026-07-02T00:00:00.000Z'))
  })
})
