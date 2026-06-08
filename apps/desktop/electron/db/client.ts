import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _client: Client | null = null

export function initClient(
  dbUrl: string,
  sync?: { syncUrl: string; authToken: string }
) {
  _client = sync
    ? createClient({ url: dbUrl, syncUrl: sync.syncUrl, authToken: sync.authToken })
    : createClient({ url: dbUrl })
  _db = drizzle(_client, { schema })
  return _db
}

export function getDb() {
  if (!_db) throw new Error('DB not initialized — call initClient() first')
  return _db
}

export async function syncNow(): Promise<void> {
  if (_client && typeof (_client as unknown as Record<string, unknown>).sync === 'function') {
    await (_client as unknown as { sync(): Promise<void> }).sync()
  }
}

export function isSyncEnabled(): boolean {
  return _client !== null && typeof (_client as unknown as Record<string, unknown>).sync === 'function'
}
