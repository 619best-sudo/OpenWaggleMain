// Uses `node:sqlite` rather than the app's better-sqlite3: that binding is
// compiled against Electron's ABI and cannot load in a plain Node test process.
// Both speak the same SQLite dialect, which is all this suite exercises.
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { APP_MIGRATIONS } from '../database-migrations'

/**
 * Migrations are replayed in order on every database, fresh ones included, so a
 * fresh install runs the entire history end to end. Typecheck cannot see any of
 * this: the statements are opaque strings, and a mistake (an `ALTER TABLE ...
 * ADD COLUMN` for a column an earlier statement already created) only surfaces
 * as a failed boot on a machine with no database yet — never on the developer's
 * already-migrated one.
 */
function applyMigrations(db: DatabaseSync, migrations: typeof APP_MIGRATIONS): void {
  for (const migration of migrations) {
    for (const statement of migration.statements) {
      db.exec(statement)
    }
  }
}

function columnNames(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

const BACKFILL_NAME = 'sessions-denormalized-message-count'

describe('APP_MIGRATIONS', () => {
  it('replays cleanly from empty — the fresh-install path', () => {
    const db = new DatabaseSync(':memory:')
    try {
      expect(() => applyMigrations(db, APP_MIGRATIONS)).not.toThrow()
    } finally {
      db.close()
    }
  })

  it('has strictly increasing, unique ids', () => {
    const ids = APP_MIGRATIONS.map((migration) => migration.id)
    expect(ids).toEqual([...ids].sort((left, right) => left - right))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lands the denormalized sessions.message_count exactly once', () => {
    const db = new DatabaseSync(':memory:')
    try {
      applyMigrations(db, APP_MIGRATIONS)
      const columns = columnNames(db, 'sessions')
      expect(columns.filter((name) => name === 'message_count')).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('backfills message_count from existing message nodes', () => {
    const db = new DatabaseSync(':memory:')
    try {
      // Stop one short of the backfill so rows exist under the pre-backfill
      // shape, the way an upgrading user's database actually looks.
      const backfill = APP_MIGRATIONS.find((migration) => migration.name === BACKFILL_NAME)
      if (!backfill) throw new Error(`Missing migration: ${BACKFILL_NAME}`)
      applyMigrations(
        db,
        APP_MIGRATIONS.filter((migration) => migration.name !== BACKFILL_NAME),
      )

      db.exec(
        `INSERT INTO sessions (id, pi_session_id, title, created_at, updated_at)
         VALUES ('s1', 'pi-1', 'Session', 1, 1)`,
      )
      const insertNode = db.prepare(
        `INSERT INTO session_nodes
           (id, session_id, pi_entry_type, kind, timestamp_ms, content_json, metadata_json, path_depth, created_order)
         VALUES (?, 's1', ?, 'text', 1, '{}', '{}', 0, ?)`,
      )
      insertNode.run('n1', 'message', 1)
      insertNode.run('n2', 'message', 2)
      insertNode.run('n3', 'summary', 3)

      applyMigrations(db, [backfill])

      const row = db.prepare(`SELECT message_count FROM sessions WHERE id = 's1'`).get() as {
        message_count: number
      }
      expect(row.message_count).toBe(2)
    } finally {
      db.close()
    }
  })
})
