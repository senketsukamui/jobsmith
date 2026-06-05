import { google, gmail_v1 } from 'googleapis'
import { safeStorage, shell } from 'electron'
import { getSetting, setSetting } from './settings'
import { getHttpServerPort } from './httpServer'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

function getRedirectUri(): string {
  const port = getHttpServerPort() ?? 53700
  return `http://127.0.0.1:${port}/api/oauth/callback`
}

const CREDS_KEY = 'gmail_credentials_encrypted'
const HISTORY_KEY = 'gmail_last_history_id'
const CONNECTED_KEY = 'gmail_connected'

// ─── Credential storage ───────────────────────────────────────────────────────

interface StoredCreds {
  access_token: string
  refresh_token: string
  expiry_date?: number
}

function encryptCreds(creds: StoredCreds): string {
  const json = JSON.stringify(creds)
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString('base64')
  }
  return Buffer.from(json).toString('base64')
}

function decryptCreds(stored: string): StoredCreds {
  const buf = Buffer.from(stored, 'base64')
  const json = safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(buf)
    : buf.toString('utf-8')
  return JSON.parse(json) as StoredCreds
}

// ─── OAuth client factory ─────────────────────────────────────────────────────

async function buildOAuth2Client(withTokens = false) {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? (await getSetting('google_client_id')) ?? ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? (await getSetting('google_client_secret')) ?? ''

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri())

  if (withTokens) {
    const stored = await getSetting(CREDS_KEY)
    if (stored) {
      const creds = decryptCreds(stored)
      oauth2.setCredentials({
        access_token: creds.access_token,
        refresh_token: creds.refresh_token,
        expiry_date: creds.expiry_date,
      })
      // Persist refreshed tokens automatically
      oauth2.on('tokens', async (tokens) => {
        if (tokens.refresh_token || tokens.access_token) {
          const updated: StoredCreds = {
            access_token: tokens.access_token ?? creds.access_token,
            refresh_token: tokens.refresh_token ?? creds.refresh_token,
            expiry_date: tokens.expiry_date ?? undefined,
          }
          await setSetting(CREDS_KEY, encryptCreds(updated))
        }
      })
    }
  }

  return oauth2
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startOAuthFlow(): Promise<{ authUrl: string }> {
  const oauth2 = await buildOAuth2Client()
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
  await shell.openExternal(authUrl)
  return { authUrl }
}

export async function handleOAuthCallback(code: string): Promise<void> {
  const oauth2 = await buildOAuth2Client()
  const { tokens } = await oauth2.getToken(code)
  const creds: StoredCreds = {
    access_token: tokens.access_token ?? '',
    refresh_token: tokens.refresh_token ?? '',
    expiry_date: tokens.expiry_date ?? undefined,
  }
  await setSetting(CREDS_KEY, encryptCreds(creds))
  await setSetting(CONNECTED_KEY, '1')
}

export async function disconnect(): Promise<void> {
  try {
    const oauth2 = await buildOAuth2Client(true)
    const creds = oauth2.credentials
    if (creds.access_token) {
      await oauth2.revokeToken(creds.access_token)
    }
  } catch { /* ignore revocation errors */ }
  await setSetting(CREDS_KEY, '')
  await setSetting(CONNECTED_KEY, '0')
  await setSetting(HISTORY_KEY, '')
}

export async function isConnected(): Promise<boolean> {
  const val = await getSetting(CONNECTED_KEY)
  return val === '1'
}

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const oauth2 = await buildOAuth2Client(true)
  return google.gmail({ version: 'v1', auth: oauth2 })
}

export async function getLastHistoryId(): Promise<string | null> {
  return getSetting(HISTORY_KEY)
}

export async function setLastHistoryId(id: string): Promise<void> {
  await setSetting(HISTORY_KEY, id)
}
