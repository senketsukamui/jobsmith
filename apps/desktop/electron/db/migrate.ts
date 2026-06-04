import { migrate } from 'drizzle-orm/libsql/migrator'
import { uuidv7 } from 'uuidv7'
import { getDb } from './client'
import { statuses } from './schema'

const SEED_STATUSES = [
  { name: 'Applied', display_order: 0, color: '#94a3b8', is_terminal: 0, is_default_new: 1 },
  { name: 'Acknowledged', display_order: 1, color: '#60a5fa', is_terminal: 0, is_default_new: 0 },
  { name: 'HR Interview', display_order: 2, color: '#a78bfa', is_terminal: 0, is_default_new: 0 },
  { name: 'Tech Interview', display_order: 3, color: '#f59e0b', is_terminal: 0, is_default_new: 0 },
  { name: 'Offer', display_order: 4, color: '#22c55e', is_terminal: 1, is_default_new: 0 },
  { name: 'Rejected', display_order: 5, color: '#ef4444', is_terminal: 1, is_default_new: 0 },
  { name: 'Ghosted', display_order: 6, color: '#6b7280', is_terminal: 1, is_default_new: 0 },
] as const

export async function runMigrations(migrationsFolder: string) {
  const db = getDb()
  await migrate(db, { migrationsFolder })
  await seedStatuses()
}

async function seedStatuses() {
  const db = getDb()
  const existing = await db.select({ id: statuses.id }).from(statuses).limit(1)
  if (existing.length > 0) return

  const now = Date.now()
  await db.insert(statuses).values(
    SEED_STATUSES.map((s) => ({
      id: uuidv7(),
      ...s,
      created_at: now,
    }))
  )
}
