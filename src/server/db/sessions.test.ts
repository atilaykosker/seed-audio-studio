// src/server/db/sessions.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'
import { createSession, getSession, getSessionRow, listSessions, renameSession, deleteSession, updateSessionPlan } from './sessions'
import type { Session } from '../../lib/types'

const brief: Session['brief'] = { idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g', aspect: 'landscape', type: 'story', shotSec: 8 }
const mk = (over: Partial<Session> = {}): Session => ({ id: '', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: { category: 'Drama', characters: [], scenes: [] }, bioPlan: null, category: 'Drama', clips: [], videoModel: 'm', ...over })

describe('sessions repo (D1)', () => {
  it('createSession persists and getSession round-trips (incl. jsonb parse)', async () => {
    const db = makeTestDb()
    const id = await createSession(db, mk({ title: 'Run' }))
    expect(id).toBeTruthy()
    const s = await getSession(db, id, [])
    expect(s?.title).toBe('Run')
    expect(s?.plan?.category).toBe('Drama')     // JSON parsed back into an object
    expect(s?.brief.idea).toBe('x')
    expect(s?.category).toBe('Drama')
  })
  it('getSession returns null for a missing id', async () => {
    expect(await getSession(makeTestDb(), 'nope', [])).toBeNull()
  })
  it('listSessions orders by updated_at desc', async () => {
    const db = makeTestDb()
    const a = await createSession(db, mk({ title: 'A' }))
    const b = await createSession(db, mk({ title: 'B' }))
    await renameSession(db, b, 'B2') // bumps b.updated_at to latest
    const list = await listSessions(db)
    expect(list[0].title).toBe('B2')
    expect(list.map((x) => x.id)).toEqual(expect.arrayContaining([a, b]))
  })
  it('deleteSession removes the row', async () => {
    const db = makeTestDb()
    const id = await createSession(db, mk())
    await deleteSession(db, id)
    expect(await getSession(db, id, [])).toBeNull()
  })

  it('updateSessionPlan writes plan/bioPlan and getSessionRow reflects it', async () => {
    const db = makeTestDb()
    const id = await createSession(db, mk())
    const plan = { category: 'Drama', characters: [], scenes: [{ id: 'sc1', title: 'S', speakers: [], visual: 'edited visual', dialogue: '' }] }
    await updateSessionPlan(db, id, plan, null)
    const row = await getSessionRow(db, id)
    expect(row?.plan?.scenes[0].visual).toBe('edited visual')
    expect(row?.plan?.scenes[0].dialogue).toBe('')
    expect(row?.bio_plan).toBeNull()
  })
})
