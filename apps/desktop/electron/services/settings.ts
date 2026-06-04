import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { settings } from '../db/schema'

export const DEFAULTS: Record<string, string> = {
  ollama_host: 'http://localhost:11434',
  ollama_model: 'qwen2.5:7b-instruct',
}

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb()
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return rows[0]?.value ?? DEFAULTS[key] ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb()
  const now = Date.now()
  await db
    .insert(settings)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at: now } })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = getDb()
  const rows = await db.select().from(settings)
  const result: Record<string, string> = { ...DEFAULTS }
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}
