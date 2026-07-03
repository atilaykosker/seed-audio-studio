import { DatabaseSync } from 'node:sqlite'
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types'
import { SCHEMA_SQL } from './schema'

class Stmt {
  private db: DatabaseSync
  private sql: string
  private params: unknown[] = []
  constructor(db: DatabaseSync, sql: string) {
    this.db = db
    this.sql = sql
  }
  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values
    return this as unknown as D1PreparedStatement
  }
  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]))
    return (row as T) ?? null
  }
  async all<T>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]))
    return { results: rows as T[] }
  }
  async run(): Promise<D1Result> {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]))
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } } as unknown as D1Result
  }
}

export function makeTestDb(): D1Database {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql) as unknown as D1PreparedStatement,
    batch: async (stmts: D1PreparedStatement[]) => Promise.all(stmts.map((s) => (s as unknown as Stmt).run())),
  }
  return d1 as unknown as D1Database
}
