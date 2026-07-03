// src/server/api/assemble.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/test-d1'
import { createSession } from '../db/sessions'
import { insertClips, updateClipStatus } from '../db/clips'
import { upsertCharacter } from '../db/characters'
import { assembleSession, assembleCharacters } from './assemble'
import type { Session, Clip, CharacterImage } from '../../lib/types'

const fakeS3 = { presignGet: async (key: string) => `https://s3.test/${key}?sig` }
const brief: Session['brief'] = { idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g', aspect: 'landscape', type: 'story', shotSec: 8 }

describe('assembleSession', () => {
  it('returns the session with clips carrying presigned media URLs', async () => {
    const db = makeTestDb()
    const s: Session = { id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null, category: 'Drama', clips: [], videoModel: 'm' }
    const id = await createSession(db, s)
    const clip: Clip = { id: 'ignored', sceneId: 'sc1', title: 'Scene 1', speakers: ['A'], prompt: 'p', status: 'pending' }
    const [row] = await insertClips(db, id, [clip])
    await updateClipStatus(db, row.id, { status: 'done', image_key: `sessions/${id}/clips/${row.id}.png`, video_key: `sessions/${id}/clips/${row.id}.mp4` })
    const out = await assembleSession(db, fakeS3, id)
    expect(out?.id).toBe(id)
    expect(out?.category).toBe('Drama')
    expect(out?.clips).toHaveLength(1)
    expect(out?.clips[0].videoUrl).toMatch(/\.mp4\?sig$/)
    expect(out?.clips[0].imageUrl).toMatch(/\.png\?sig$/)
  })
  it('returns null for a missing session', async () => {
    expect(await assembleSession(makeTestDb(), fakeS3, 'nope')).toBeNull()
  })
  it('leaves media URLs undefined for a not-yet-generated clip', async () => {
    const db = makeTestDb()
    const id = await createSession(db, { id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'D', characters: [], scenes: [] }, bioPlan: null, category: 'D', clips: [], videoModel: 'm' })
    await insertClips(db, id, [{ id: 'x', sceneId: 'sc', title: 'S', speakers: [], prompt: 'p', status: 'pending' }])
    const out = await assembleSession(db, fakeS3, id)
    expect(out?.clips[0].videoUrl).toBeUndefined()
    expect(out?.clips[0].imageUrl).toBeUndefined()
  })
})

describe('assembleCharacters', () => {
  it('returns library characters with presigned image URLs', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    await upsertCharacter(db, c, 'characters/robot.png')
    const list = await assembleCharacters(db, fakeS3)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Robot')
    expect(list[0].url).toMatch(/characters\/robot\.png\?sig$/)
  })
})
