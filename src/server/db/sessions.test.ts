// src/server/db/sessions.test.ts
import { describe, it, expect } from 'vitest'
import { createSession, getSession, listSessions } from './sessions'
import type { Session, Clip } from '../../lib/types'

const brief: Session['brief'] = {
  idea: 'x', durationSec: 8, language: 'EN', speakers: 'auto', genre: 'g',
  aspect: 'landscape', type: 'story', shotSec: 8,
}

// Minimal fake matching the supabase-js fluent surface the repo uses.
function fakeDb(result: unknown) {
  const calls: Array<{ m: string; args: unknown[] }> = []
  const chain: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['from', 'insert', 'select', 'eq', 'order', 'single', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ m, args })
      // terminal-ish methods resolve; others return the chain
      if (m === 'single') return Promise.resolve(result)
      return chain
    }
  }
  // make the chain awaitable for non-.single() terminals (select/order/delete/update)
  ;(chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(result)
  return { db: chain as unknown, calls }
}

describe('createSession', () => {
  it('inserts the mapped row and returns the new id', async () => {
    const { db, calls } = fakeDb({ data: { id: 'new-id' }, error: null })
    const s: Session = { id: 'ignored', title: 'T', createdAt: 0, updatedAt: 0, brief, plan: null, bioPlan: null, category: null, clips: [], videoModel: 'm' }
    const id = await createSession(db as never, s)
    expect(id).toBe('new-id')
    expect(calls.find((c) => c.m === 'from')?.args[0]).toBe('sessions')
    expect(calls.some((c) => c.m === 'insert')).toBe(true)
  })
})

describe('getSession', () => {
  it('returns a mapped domain Session with the passed-in clips', async () => {
    const row = { id: 'sid', title: 'T', brief, plan: null, bio_plan: null, category: null, video_model: 'm', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z' }
    const { db } = fakeDb({ data: row, error: null })
    const clips: Clip[] = []
    const s = await getSession(db as never, 'sid', clips)
    expect(s?.id).toBe('sid')
    expect(s?.clips).toBe(clips)
  })

  it('returns null when the row is missing', async () => {
    const { db } = fakeDb({ data: null, error: null })
    const s = await getSession(db as never, 'nope', [])
    expect(s).toBeNull()
  })
})

describe('listSessions', () => {
  it('targets sessions ordered by updated_at desc and maps lightweight fields', async () => {
    const rows = [{ id: 's1', title: 'A', category: 'C', video_model: 'm', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:05.000Z' }]
    const { db, calls } = fakeDb({ data: rows, error: null })
    const list = await listSessions(db as never)
    expect(list[0]).toMatchObject({ id: 's1', title: 'A', category: 'C', videoModel: 'm' })
    expect(calls.find((c) => c.m === 'order')?.args[0]).toBe('updated_at')
  })
})
