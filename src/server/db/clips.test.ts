// src/server/db/clips.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'
import { insertClips, listClipsBySession, getClip, getClipBySceneId, updateClipStatus } from './clips'
import { createSession } from './sessions'
import type { Clip, Session } from '../../lib/types'

const brief: Session['brief'] = { idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g', aspect: 'landscape', type: 'story', shotSec: 8 }
const mkSession = (over: Partial<Session> = {}): Session => ({ id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: null, bioPlan: null, category: null, clips: [], videoModel: 'm', ...over })

async function mkSessionId(db: ReturnType<typeof makeTestDb>) {
  return createSession(db, mkSession())
}

describe('insertClips + listClipsBySession (D1)', () => {
  it('inserts clips and returns them in insert order with speakers parsed to an array', async () => {
    const db = makeTestDb()
    const sessionId = await mkSessionId(db)
    const clips: Clip[] = [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: ['Alice'], prompt: 'p1', status: 'pending' },
      { id: 'b', sceneId: 's2', title: 'T2', speakers: ['Bob', 'Carol'], prompt: 'p2', status: 'pending' },
    ]
    const inserted = await insertClips(db, sessionId, clips)
    expect(inserted).toHaveLength(2)
    expect(inserted[0].speakers).toEqual(['Alice'])
    expect(inserted[1].speakers).toEqual(['Bob', 'Carol'])

    const listed = await listClipsBySession(db, sessionId)
    expect(listed).toHaveLength(2)
    expect(listed.map((c) => c.scene_id)).toEqual(['s1', 's2'])
    expect(Array.isArray(listed[0].speakers)).toBe(true)
    expect(listed[0].speakers).toEqual(['Alice'])
    expect(listed[1].speakers).toEqual(['Bob', 'Carol'])
  })
})

describe('updateClipStatus (D1)', () => {
  it('applies only the provided fields via a dynamic UPDATE', async () => {
    const db = makeTestDb()
    const sessionId = await mkSessionId(db)
    const [clip] = await insertClips(db, sessionId, [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: ['Alice'], prompt: 'p1', status: 'pending' },
    ])
    await updateClipStatus(db, clip.id, {
      status: 'done',
      image_key: 'images/a.png',
      request_id: 'req-1',
      request_endpoint: 'ep-1',
    })
    const updated = await getClip(db, clip.id)
    expect(updated?.status).toBe('done')
    expect(updated?.image_key).toBe('images/a.png')
    expect(updated?.request_id).toBe('req-1')
    expect(updated?.request_endpoint).toBe('ep-1')
    // untouched fields remain
    expect(updated?.title).toBe('T1')
    expect(updated?.prompt).toBe('p1')
  })

  it('is a no-op when patch is empty', async () => {
    const db = makeTestDb()
    const sessionId = await mkSessionId(db)
    const [clip] = await insertClips(db, sessionId, [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: [], prompt: 'p1', status: 'pending' },
    ])
    await updateClipStatus(db, clip.id, {})
    const after = await getClip(db, clip.id)
    expect(after?.status).toBe('pending')
  })
})

describe('getClipBySceneId (D1)', () => {
  it('finds the right clip by session_id + scene_id', async () => {
    const db = makeTestDb()
    const sessionId = await mkSessionId(db)
    await insertClips(db, sessionId, [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: [], prompt: 'p1', status: 'pending' },
      { id: 'b', sceneId: 's2', title: 'T2', speakers: [], prompt: 'p2', status: 'pending' },
    ])
    const found = await getClipBySceneId(db, sessionId, 's2')
    expect(found?.title).toBe('T2')
    expect(found?.speakers).toEqual([])
  })

  it('returns null when no match', async () => {
    const db = makeTestDb()
    const sessionId = await mkSessionId(db)
    const found = await getClipBySceneId(db, sessionId, 'nope')
    expect(found).toBeNull()
  })
})

describe('getClip (D1)', () => {
  it('returns null on missing id', async () => {
    const db = makeTestDb()
    expect(await getClip(db, 'missing')).toBeNull()
  })
})
