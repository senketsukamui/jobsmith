import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

const configPath = () => path.join(app.getPath('userData'), 'sync-config.json')

interface SyncConfigFile {
  syncUrl: string
  encryptedToken: string
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value).toString('base64')
}

function decrypt(stored: string): string {
  const buf = Buffer.from(stored, 'base64')
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      throw new Error('Sync credentials are stale. Please re-enter them.')
    }
  }
  return buf.toString('utf-8')
}

export interface SyncConfig {
  syncUrl: string
  authToken: string
}

export function readSyncConfig(): SyncConfig | null {
  const file = configPath()
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as SyncConfigFile
    return { syncUrl: raw.syncUrl, authToken: decrypt(raw.encryptedToken) }
  } catch {
    return null
  }
}

export function writeSyncConfig(syncUrl: string, authToken: string): void {
  const data: SyncConfigFile = { syncUrl, encryptedToken: encrypt(authToken) }
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function clearSyncConfig(): void {
  const file = configPath()
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export function getSyncConfigPublic(): { syncUrl: string | null; active: boolean } {
  const file = configPath()
  if (!fs.existsSync(file)) return { syncUrl: null, active: false }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as SyncConfigFile
    return { syncUrl: raw.syncUrl, active: true }
  } catch {
    return { syncUrl: null, active: false }
  }
}

export async function testSyncConnection(
  syncUrl: string,
  authToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { createClient } = await import('@libsql/client')
    const client = createClient({ url: syncUrl, authToken })
    await client.execute('SELECT 1')
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
