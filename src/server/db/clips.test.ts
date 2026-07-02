// src/server/db/clips.test.ts
import { describe, it, expect } from 'vitest'
import { insertClips, listClipsBySession } from './clips'
import type { Clip } from '../../lib/types'

function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'update', 'delete', 'upsert']) {
    chain[m] = (...args: unknown[]) => { calls.push({ m, args }); return chain }
  }
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('insertClips', () => {
  it('bulk-inserts mapped rows into clips and returns inserted rows', async () => {
    const inserted = [{ id: 'c1' }, { id: 'c2' }]
    const { db, calls } = fakeDb({ data: inserted, error: null })
    const clips: Clip[] = [
      { id: 'a', sceneId: 's1', title: 'T1', speakers: [], prompt: 'p1', status: 'pending' },
      { id: 'b', sceneId: 's2', title: 'T2', speakers: [], prompt: 'p2', status: 'pending' },
    ]
    const rows = await insertClips(db as never, 'sid', clips)
    expect(rows).toEqual(inserted)
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('clips')
    const insertArg = calls.find((c) => c.m === 'insert')?.args[0] as unknown[]
    expect(Array.isArray(insertArg)).toBe(true)
    expect(insertArg).toHaveLength(2)
    expect((insertArg[0] as { session_id: string }).session_id).toBe('sid')
  })
})

describe('listClipsBySession', () => {
  it('filters by session_id and orders by created_at asc', async () => {
    const { db, calls } = fakeDb({ data: [], error: null })
    await listClipsBySession(db as never, 'sid')
    expect(calls.find((c) => c.m === 'eq')?.args).toEqual(['session_id', 'sid'])
    expect(calls.find((c) => c.m === 'order')?.args[0]).toBe('created_at')
  })
})
