import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { emails, companies, applications, statuses } from '../db/schema'
import { getGmailClient, getLastHistoryId, setLastHistoryId } from './gmail'
import { getSetting } from './settings'
import { streamGenerate } from './ollama'
import type { EmailClassification } from '@job-tracker/shared'

const PROMPT_PATH = path.join(__dirname, '../services/llm/prompts/email-classification.md')

const CANDIDATE_KEYWORDS = [
  'application', 'applied', 'thank you for applying', 'thank you for your application',
  'interview', 'next steps', 'unfortunately', 'we regret', 'not moving forward',
  'position has been filled', 'offer', 'congratulations', 'hiring decision',
  'follow up', 'recruiter', 'talent acquisition',
]

// ─── Levenshtein for fuzzy matching ──────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// ─── Candidate filter ─────────────────────────────────────────────────────────

function isCandidate(
  subject: string,
  snippet: string,
  fromDomain: string,
  companyDomains: string[]
): boolean {
  if (companyDomains.some((d) => d && fromDomain.endsWith(d))) return true
  const text = `${subject} ${snippet}`.toLowerCase()
  return CANDIDATE_KEYWORDS.some((kw) => text.includes(kw))
}

// ─── LLM classification ───────────────────────────────────────────────────────

interface ClassificationResult {
  classification: EmailClassification
  confidence: number
  company_guess: string
  role_guess: string
  reasoning: string
}

function loadPromptTemplate(): string {
  try { return fs.readFileSync(PROMPT_PATH, 'utf-8') } catch {
    return `Classify this job application email as JSON with fields: classification, confidence, company_guess, role_guess, reasoning.\n\nEMAIL:\nFrom: {from_name} <{from_address}>\nSubject: {subject}\nDate: {received_at}\n\n{body_truncated_to_2000_chars}`
  }
}

async function classifyEmail(params: {
  from_name: string
  from_address: string
  subject: string
  received_at: string
  body: string
}): Promise<ClassificationResult | null> {
  const model = (await getSetting('ollama_model')) ?? 'qwen2.5:7b-instruct'
  const prompt = loadPromptTemplate()
    .replace('{from_name}', params.from_name)
    .replace('{from_address}', params.from_address)
    .replace('{subject}', params.subject)
    .replace('{received_at}', params.received_at)
    .replace('{body_truncated_to_2000_chars}', params.body.slice(0, 2000))

  let raw = ''
  try {
    for await (const token of streamGenerate(model, prompt, undefined, { format: 'json' })) {
      raw += token
    }
    const parsed = JSON.parse(raw) as ClassificationResult
    return parsed
  } catch {
    return null
  }
}

// ─── Application fuzzy matcher ────────────────────────────────────────────────

async function findMatchingApplication(
  companyGuess: string,
  roleGuess: string
): Promise<string | null> {
  if (!companyGuess && !roleGuess) return null

  const db = getDb()
  const apps = await db
    .select({
      id: applications.id,
      role_title: applications.role_title,
      company_name: companies.name,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))

  const THRESHOLD = 4
  let bestId: string | null = null
  let bestScore = Infinity

  for (const app of apps) {
    const compScore = companyGuess
      ? levenshtein(app.company_name.toLowerCase(), companyGuess.toLowerCase())
      : 0
    const roleScore = roleGuess
      ? levenshtein(app.role_title.toLowerCase(), roleGuess.toLowerCase())
      : 0
    const score = compScore + roleScore

    if (score < bestScore && compScore <= THRESHOLD && (roleGuess === '' || roleScore <= THRESHOLD)) {
      bestScore = score
      bestId = app.id
    }
  }

  return bestId
}

// ─── Gmail message fetching ───────────────────────────────────────────────────

interface RawEmail {
  gmailMessageId: string
  gmailThreadId: string
  subject: string
  fromAddress: string
  fromName: string
  receivedAt: number
  snippet: string
  body: string
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractBody(payload: { parts?: { mimeType?: string | null; body?: { data?: string | null } | null }[] | null; body?: { data?: string | null } | null; mimeType?: string | null }): string {
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data)
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }
  return ''
}

function headerVal(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// ─── Main scan function ───────────────────────────────────────────────────────

export interface ScanResult {
  scanned: number
  newMatches: number
}

export async function scanEmails(): Promise<ScanResult> {
  const db = getDb()
  const gmail = await getGmailClient()

  // Collect known company domains for candidate filtering
  const allCompanies = await db.select({ website: companies.website }).from(companies)
  const companyDomains = allCompanies
    .map((c) => {
      try { return new URL(c.website ?? '').hostname.replace('www.', '') } catch { return '' }
    })
    .filter(Boolean)

  // Fetch new messages via history API or initial load
  const lastHistoryId = await getLastHistoryId()
  let messageIds: string[] = []
  let newHistoryId: string | undefined

  if (lastHistoryId) {
    try {
      const histResp = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded'],
      })
      newHistoryId = histResp.data.historyId ?? undefined
      for (const record of histResp.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) messageIds.push(added.message.id)
        }
      }
    } catch {
      // historyId expired — fall back to recent messages
      messageIds = []
    }
  }

  // Fallback: fetch last 50 messages
  if (messageIds.length === 0 && !lastHistoryId) {
    const listResp = await gmail.users.messages.list({ userId: 'me', maxResults: 50 })
    messageIds = (listResp.data.messages ?? []).map((m) => m.id ?? '').filter(Boolean)
    newHistoryId = listResp.data.nextPageToken ? undefined : undefined
    // Capture profile historyId for future delta queries
    const profile = await gmail.users.getProfile({ userId: 'me' })
    newHistoryId = profile.data.historyId ?? undefined
  }

  let scanned = 0
  let newMatches = 0

  // Deduplicate against already-seen messages
  const existingIds = new Set(
    (await db.select({ gid: emails.gmail_message_id }).from(emails)).map((r) => r.gid)
  )

  for (const msgId of messageIds) {
    if (existingIds.has(msgId)) continue

    let raw: RawEmail
    try {
      const msgResp = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      })
      const msg = msgResp.data
      const headers = msg.payload?.headers ?? []

      const fromHeader = headerVal(headers, 'from')
      const fromMatch = fromHeader.match(/^"?([^"<]+)"?\s*<([^>]+)>$/)
      const fromName = fromMatch?.[1]?.trim() ?? fromHeader
      const fromAddress = fromMatch?.[2]?.trim() ?? fromHeader

      raw = {
        gmailMessageId: msg.id ?? msgId,
        gmailThreadId: msg.threadId ?? '',
        subject: headerVal(headers, 'subject'),
        fromAddress,
        fromName,
        receivedAt: parseInt(msg.internalDate ?? '0'),
        snippet: msg.snippet ?? '',
        body: extractBody(msg.payload ?? {}),
      }
    } catch { continue }

    scanned++
    const fromDomain = raw.fromAddress.split('@')[1] ?? ''

    if (!isCandidate(raw.subject, raw.snippet, fromDomain, companyDomains)) continue

    // Run LLM classification
    const classification = await classifyEmail({
      from_name: raw.fromName,
      from_address: raw.fromAddress,
      subject: raw.subject,
      received_at: new Date(raw.receivedAt).toISOString(),
      body: raw.body || raw.snippet,
    })

    if (!classification || classification.classification === 'unrelated') continue

    // Fuzzy-match to an application
    const linkedAppId = await findMatchingApplication(
      classification.company_guess,
      classification.role_guess
    )

    // Find matching status for suggestion
    let suggestedStatusId: string | null = null
    if (classification.confidence >= 0.6) {
      const statusMap: Record<string, string[]> = {
        rejection: ['rejected', 'rejection'],
        interview_invite: ['hr interview', 'tech interview', 'interview'],
        offer: ['offer'],
        acknowledgment: ['applied', 'acknowledged'],
      }
      const keywords = statusMap[classification.classification] ?? []
      if (keywords.length > 0) {
        const allStatuses = await db.select().from(statuses)
        const match = allStatuses.find((s) =>
          keywords.some((kw) => s.name.toLowerCase().includes(kw))
        )
        suggestedStatusId = match?.id ?? null
      }
    }

    const now = Date.now()
    await db.insert(emails).values({
      id: uuidv7(),
      gmail_message_id: raw.gmailMessageId,
      gmail_thread_id: raw.gmailThreadId,
      subject: raw.subject,
      from_address: raw.fromAddress,
      from_name: raw.fromName,
      received_at: raw.receivedAt,
      body_snippet: raw.snippet,
      classification: classification.classification as EmailClassification,
      confidence: classification.confidence,
      suggested_status_id: suggestedStatusId,
      linked_application_id: linkedAppId,
      linked_company_id: null,
      user_action: 'pending',
      raw_llm_output: JSON.stringify(classification),
      processed_at: now,
    })

    newMatches++
  }

  if (newHistoryId) {
    await setLastHistoryId(newHistoryId)
  }

  return { scanned, newMatches }
}

export async function getPendingEmails() {
  const db = getDb()
  return db
    .select()
    .from(emails)
    .where(eq(emails.user_action, 'pending'))
}

export async function acceptEmailSuggestion(id: string): Promise<void> {
  const db = getDb()
  const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1)
  if (!email) return

  await db.update(emails).set({ user_action: 'accepted' }).where(eq(emails.id, id))

  if (email.linked_application_id && email.suggested_status_id) {
    const { changeStatus } = await import('./applications')
    await changeStatus({
      id: email.linked_application_id,
      status_id: email.suggested_status_id,
      note: `Accepted from email: ${email.subject ?? ''}`,
      source: 'email',
    })
  }
}

export async function dismissEmailSuggestion(id: string): Promise<void> {
  const db = getDb()
  await db.update(emails).set({ user_action: 'dismissed' }).where(eq(emails.id, id))
}

export async function linkEmailToApplication(id: string, applicationId: string): Promise<void> {
  const db = getDb()
  await db
    .update(emails)
    .set({ linked_application_id: applicationId })
    .where(eq(emails.id, id))
}
