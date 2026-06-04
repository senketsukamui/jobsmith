import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { statuses } from '../db/schema'
import type { Status } from '@job-tracker/shared'

export async function listStatuses(): Promise<Status[]> {
  const db = getDb()
  return db.select().from(statuses).orderBy(asc(statuses.display_order))
}

export async function getDefaultStatus(): Promise<Status> {
  const db = getDb()
  const results = await db
    .select()
    .from(statuses)
    .where(eq(statuses.is_default_new, 1))
    .limit(1)

  if (results.length === 0) {
    const all = await db.select().from(statuses).orderBy(asc(statuses.display_order)).limit(1)
    if (all.length === 0) throw new Error('No statuses found — run migrations and seed first')
    return all[0]
  }
  return results[0]
}
