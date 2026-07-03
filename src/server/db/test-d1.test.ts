// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeTestDb } from './test-d1'

describe('test-d1 adapter', () => {
  it('applies the schema and round-trips a row through the D1 surface', async () => {
    const db = makeTestDb()
    await db.prepare('insert into sessions (id,title,brief,video_model,created_at,updated_at) values (?,?,?,?,?,?)')
      .bind('s1', 'T', '{"idea":"x"}', 'm', 'now', 'now').run()
    const row = await db.prepare('select * from sessions where id = ?').bind('s1').first<{ id: string; title: string }>()
    expect(row?.id).toBe('s1')
    expect(row?.title).toBe('T')
    const list = await db.prepare('select * from sessions').all<{ id: string }>()
    expect(list.results).toHaveLength(1)
  })

  it('enforces the name_normalized unique index (case-insensitive)', async () => {
    const db = makeTestDb()
    const ins = (name: string) => db.prepare('insert into character_library (id,name,image_key,created_at) values (?,?,?,?)').bind(crypto.randomUUID(), name, 'k', 'now').run()
    await ins('Robot')
    await expect(ins('robot')).rejects.toThrow() // unique(lower(name)) violation
  })

  it('cascades clip deletes when a session is removed', async () => {
    const db = makeTestDb()
    await db.prepare('insert into sessions (id,title,brief,video_model,created_at,updated_at) values (?,?,?,?,?,?)').bind('s1','T','{}','m','now','now').run()
    await db.prepare('insert into clips (id,session_id,scene_id,title,created_at) values (?,?,?,?,?)').bind('c1','s1','sc','T','now').run()
    await db.prepare('delete from sessions where id = ?').bind('s1').run()
    const clip = await db.prepare('select * from clips where id = ?').bind('c1').first()
    expect(clip).toBeNull()
  })
})
