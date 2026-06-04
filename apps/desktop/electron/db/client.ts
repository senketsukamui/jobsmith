import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function initClient(dbUrl: string) {
  const client = createClient({ url: dbUrl })
  _db = drizzle(client, { schema })
  return _db
}

export function getDb() {
  if (!_db) throw new Error('DB not initialized — call initClient() first')
  return _db
}
