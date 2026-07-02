// src/server/db/characters.test.ts
import { describe, it, expect } from 'vitest'
import { upsertCharacter, listCharacters, insertPendingCharacter, getCharacter } from './characters'
import type { CharacterImage } from '../../lib/types'

function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'update', 'delete', 'upsert', 'single']) {
    chain[m] = (...args: unknown[]) => { calls.push({ m, args }); if (m === 'single') return Promise.resolve(result); return chain }
  }
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('upsertCharacter', () => {
  it('upserts on the name conflict target and returns the row', async () => {
    const row = { id: 'i', name: 'Robot', image_key: 'characters/i.png', source: 'minted', request_id: null, status: 'done', created_at: 'x' }
    const { db, calls } = fakeDb({ data: row, error: null })
    const ch: CharacterImage = { id: 'i', name: 'Robot', url: 'https://fal/x', source: 'minted', createdAt: 5 }
    const out = await upsertCharacter(db as never, ch, 'characters/i.png')
    expect(out).toEqual(row)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
    expect(calls.some((c) => c.m === 'upsert')).toBe(true)
  })
})

describe('listCharacters', () => {
  it('selects from character_library', async () => {
    const { db, calls } = fakeDb({ data: [], error: null })
    await listCharacters(db as never)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
  })
})

describe('insertPendingCharacter', () => {
  it('upserts a queued row on the name conflict target and returns it', async () => {
    const row = { id: 'i', name: 'Robot', image_key: '', source: 'minted', request_id: 'req-1', status: 'queued', created_at: 'x' }
    const { db, calls } = fakeDb({ data: row, error: null })
    const ch: CharacterImage = { id: '', name: 'Robot', url: '', source: 'minted', createdAt: 0 }
    const out = await insertPendingCharacter(db as never, ch, 'req-1')
    expect(out).toEqual(row)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
    const upsertCall = calls.find((c) => c.m === 'upsert')
    expect(upsertCall?.args[0]).toMatchObject({ status: 'queued', request_id: 'req-1' })
    expect(upsertCall?.args[1]).toEqual({ onConflict: 'name_normalized' })
  })
})

describe('getCharacter', () => {
  it('returns the mapped row when found', async () => {
    const row = { id: 'i', name: 'Robot', image_key: 'characters/i.png', source: 'minted', request_id: null, status: 'done', created_at: 'x' }
    const { db, calls } = fakeDb({ data: row, error: null })
    const out = await getCharacter(db as never, 'i')
    expect(out).toEqual(row)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('character_library')
    expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['id', 'i'])
  })

  it('returns null when the row is missing (PGRST116)', async () => {
    const { db } = fakeDb({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    const out = await getCharacter(db as never, 'missing')
    expect(out).toBeNull()
  })
})
