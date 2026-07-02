// src/server/db/characters.test.ts
import { describe, it, expect } from 'vitest'
import { upsertCharacter, listCharacters } from './characters'
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
