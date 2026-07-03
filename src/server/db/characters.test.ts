// src/server/db/characters.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'
import { upsertCharacter, insertPendingCharacter, finishCharacter, setCharacterError, getCharacter, listCharacters, deleteCharacter } from './characters'
import type { CharacterImage } from '../../lib/types'

describe('insertPendingCharacter + getCharacter (D1)', () => {
  it('inserts a queued row with the request id', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const row = await insertPendingCharacter(db, c, 'req-1')
    expect(row.status).toBe('queued')
    expect(row.request_id).toBe('req-1')
    const fetched = await getCharacter(db, row.id)
    expect(fetched?.status).toBe('queued')
    expect(fetched?.request_id).toBe('req-1')
  })
})

describe('character upsert on name_normalized (D1)', () => {
  it('insertPendingCharacter upserts on normalized name (no duplicate across case/retry)', async () => {
    const db = makeTestDb()
    const c = { id: '', name: 'Robot', url: '', source: 'minted' as const, createdAt: 0 }
    const r1 = await insertPendingCharacter(db, c, 'req-1')
    const r2 = await insertPendingCharacter(db, { ...c, name: 'robot' }, 'req-2')
    const list = await listCharacters(db)
    expect(list).toHaveLength(1) // deduped by lower(name)
    expect(r2.request_id).toBe('req-2') // second call updated the row
    expect(r1.id).toBe(r2.id) // same row id
  })

  it('upsertCharacter updates an existing pending row to done', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const pending = await insertPendingCharacter(db, c, 'req-1')
    const done = await upsertCharacter(db, { ...c, name: 'ROBOT' }, 'characters/robot.png')
    expect(done.id).toBe(pending.id)
    expect(done.status).toBe('done')
    expect(done.image_key).toBe('characters/robot.png')
    expect(done.request_id).toBeNull()
    const list = await listCharacters(db)
    expect(list).toHaveLength(1)
  })
})

describe('finishCharacter / setCharacterError (D1)', () => {
  it('finishCharacter flips to done with the image key and clears request_id', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const pending = await insertPendingCharacter(db, c, 'req-1')
    await finishCharacter(db, pending.id, 'characters/robot.png')
    const after = await getCharacter(db, pending.id)
    expect(after?.status).toBe('done')
    expect(after?.image_key).toBe('characters/robot.png')
    expect(after?.request_id).toBeNull()
  })

  it('setCharacterError sets status=error and clears request_id', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const pending = await insertPendingCharacter(db, c, 'req-1')
    await setCharacterError(db, pending.id)
    const after = await getCharacter(db, pending.id)
    expect(after?.status).toBe('error')
    expect(after?.request_id).toBeNull()
  })
})

describe('deleteCharacter (D1)', () => {
  it('removes the row', async () => {
    const db = makeTestDb()
    const c: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const pending = await insertPendingCharacter(db, c, 'req-1')
    await deleteCharacter(db, pending.id)
    expect(await getCharacter(db, pending.id)).toBeNull()
  })
})

describe('getCharacter (D1)', () => {
  it('returns null on missing id', async () => {
    const db = makeTestDb()
    expect(await getCharacter(db, 'missing')).toBeNull()
  })
})

describe('listCharacters (D1)', () => {
  it('orders by created_at asc', async () => {
    const db = makeTestDb()
    const a = await insertPendingCharacter(db, { id: '', name: 'A', url: '', source: 'minted', createdAt: 0 }, 'req-a')
    const b = await insertPendingCharacter(db, { id: '', name: 'B', url: '', source: 'minted', createdAt: 0 }, 'req-b')
    const list = await listCharacters(db)
    expect(list.map((x) => x.id)).toEqual([a.id, b.id])
  })
})
