import { createHash, randomBytes } from 'crypto'
import { safeStorage } from 'electron'
import { getSetting, setSetting } from './settings'

const PLAIN_KEY = 'extension_pairing_token_plain'
const HASH_KEY = 'extension_pairing_token'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64')
  }
  return token
}

function decryptToken(stored: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }
  return stored
}

async function storeToken(plain: string): Promise<void> {
  await setSetting(HASH_KEY, hashToken(plain))
  await setSetting(PLAIN_KEY, encryptToken(plain))
}

export async function getOrCreatePairingToken(): Promise<string> {
  const stored = await getSetting(PLAIN_KEY)
  if (stored) {
    try {
      return decryptToken(stored)
    } catch {
      // Encrypted under a different app identity (e.g. after a rename) — regenerate
    }
  }

  const plain = randomBytes(24).toString('base64url')
  await storeToken(plain)
  return plain
}

export async function rotatePairingToken(): Promise<string> {
  const plain = randomBytes(24).toString('base64url')
  await storeToken(plain)
  return plain
}

export async function validateToken(provided: string): Promise<boolean> {
  const storedHash = await getSetting(HASH_KEY)
  if (!storedHash) return false
  return hashToken(provided) === storedHash
}
