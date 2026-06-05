import { asc, eq, ne, count } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { statuses, applications } from '../db/schema'
import type { Status, CreateStatusInput, UpdateStatusInput } from '@job-tracker/shared'

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

export async function createStatus(input: CreateStatusInput): Promise<Status> {
  const db = getDb()
  const now = Date.now()
  const id = uuidv7()

  const all = await db.select().from(statuses).orderBy(asc(statuses.display_order))
  const display_order = all.length > 0 ? (all[all.length - 1].display_order + 1) : 0

  await db.insert(statuses).values({
    id,
    name: input.name,
    color: input.color ?? '#94a3b8',
    is_terminal: input.is_terminal ?? 0,
    is_default_new: 0,
    display_order,
    created_at: now,
  })

  const [created] = await db.select().from(statuses).where(eq(statuses.id, id))
  return created
}

export async function updateStatus(input: UpdateStatusInput): Promise<Status> {
  const db = getDb()

  // If setting is_default_new=1, clear existing default first
  if (input.is_default_new === 1) {
    await db
      .update(statuses)
      .set({ is_default_new: 0 })
      .where(ne(statuses.id, input.id))
  }

  const patch: Partial<typeof statuses.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.color !== undefined) patch.color = input.color
  if (input.is_terminal !== undefined) patch.is_terminal = input.is_terminal
  if (input.is_default_new !== undefined) patch.is_default_new = input.is_default_new

  await db.update(statuses).set(patch).where(eq(statuses.id, input.id))

  const [updated] = await db.select().from(statuses).where(eq(statuses.id, input.id))
  return updated
}

export async function deleteStatus(id: string): Promise<void> {
  const db = getDb()

  // Check if any application currently uses this status
  const [result] = await db
    .select({ cnt: count() })
    .from(applications)
    .where(eq(applications.current_status_id, id))

  if (result.cnt > 0) {
    throw new Error(
      `Cannot delete: ${result.cnt} application(s) currently use this status. Reassign them first.`
    )
  }

  await db.delete(statuses).where(eq(statuses.id, id))
}

export async function reorderStatuses(orderedIds: string[]): Promise<Status[]> {
  const db = getDb()

  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(statuses)
      .set({ display_order: i })
      .where(eq(statuses.id, orderedIds[i]))
  }

  return db.select().from(statuses).orderBy(asc(statuses.display_order))
}
