import { eq, inArray, desc } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { emails, companies, applications, statuses } from '../db/schema'
import { getGmailClient, getLastHistoryId, setLastHistoryId } from './gmail'
import { getSetting } from './settings'
import { streamGenerate } from './ollama'
import type { EmailClassification } from '@jobsmith/shared'

const PROMPT_PATH = path.join(__dirname, '../services/llm/prompts/email-classification.md')

const AUTO_APPLY_THRESHOLD = 0.65

const CANDIDATE_KEYWORDS = [
  'application', 'applied', 'applying',
  'thank you for applying', 'thanks for applying',
  'thank you for your application', 'thanks for your application',
  'thank you for considering', 'thanks for considering',
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
  const model = (await getSetting('ollama_model')) ?? 'qwen2.5:3b-instruct'
  const prompt = loadPromptTemplate()
    .replace('{from_name}', params.from_name)
    .replace('{from_address}', params.from_address)
    .replace('{subject}', params.subject)
    .replace('{received_at}', params.received_at)
    .replace('{body_truncated_to_2000_chars}', params.body.slice(0, 2000))

  console.log(`[emailScanner] classifyEmail: subject="${params.subject}" from="${params.from_address}"`)
  let raw = ''
  try {
    for await (const token of streamGenerate(model, prompt, undefined, { format: 'json' })) {
      raw += token
    }
    console.log(`[emailScanner] LLM raw output: ${raw.slice(0, 300)}`)
    const raw_parsed = JSON.parse(raw) as Record<string, unknown>
    const coerceStr = (v: unknown): string =>
      Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''
    const parsed: ClassificationResult = {
      classification: raw_parsed.classification as EmailClassification,
      confidence: typeof raw_parsed.confidence === 'number' ? raw_parsed.confidence : 0,
      company_guess: coerceStr(raw_parsed.company_guess),
      role_guess: coerceStr(raw_parsed.role_guess),
      reasoning: coerceStr(raw_parsed.reasoning),
    }
    console.log(`[emailScanner] classified as ${parsed.classification} (confidence=${parsed.confidence}, company="${parsed.company_guess}", role="${parsed.role_guess}")`)
    return parsed
  } catch (err) {
    console.error('[emailScanner] classifyEmail error:', err, 'raw:', raw.slice(0, 300))
    return null
  }
}

// ─── Application fuzzy matcher ────────────────────────────────────────────────

async function findMatchingApplication(
  companyGuess: string,
  roleGuess: string
): Promise<{ appId: string; companyId: string } | null> {
  if (!companyGuess && !roleGuess) return null

  const db = getDb()
  const apps = await db
    .select({
      id: applications.id,
      company_id: applications.company_id,
      role_title: applications.role_title,
      company_name: companies.name,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))
    .where(eq(applications.archived, 0))

  const THRESHOLD = 4
  let best: { appId: string; companyId: string } | null = null
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
      best = { appId: app.id, companyId: app.company_id }
    }
  }

  console.log(`[emailScanner] findMatchingApplication: company="${companyGuess}" role="${roleGuess}" → ${best?.appId ?? 'no match'} (score=${bestScore})`)
  return best
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
  autoApplied: number
}

export async function scanEmails(): Promise<ScanResult> {
  const db = getDb()
  console.log('[emailScanner] scanEmails started')
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

  console.log(`[emailScanner] lastHistoryId=${lastHistoryId}`)

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
      console.log(`[emailScanner] history API returned ${messageIds.length} new message(s), newHistoryId=${newHistoryId}`)
    } catch (err) {
      console.warn('[emailScanner] history API failed, will fallback to list:', err)
      messageIds = []
    }
  }

  // Fallback: fetch last 50 messages
  if (messageIds.length === 0 && !lastHistoryId) {
    console.log('[emailScanner] no lastHistoryId, fetching last 50 messages')
    const listResp = await gmail.users.messages.list({ userId: 'me', maxResults: 50 })
    messageIds = (listResp.data.messages ?? []).map((m) => m.id ?? '').filter(Boolean)
    // Capture profile historyId for future delta queries
    const profile = await gmail.users.getProfile({ userId: 'me' })
    newHistoryId = profile.data.historyId ?? undefined
    console.log(`[emailScanner] fetched ${messageIds.length} messages, newHistoryId=${newHistoryId}`)
  }

  // Also fallback when history expired (got 0 from history but had a lastHistoryId)
  if (messageIds.length === 0 && lastHistoryId) {
    console.log('[emailScanner] history returned 0 messages (may be up-to-date or expired), fetching last 50 as fallback')
    const listResp = await gmail.users.messages.list({ userId: 'me', maxResults: 50 })
    messageIds = (listResp.data.messages ?? []).map((m) => m.id ?? '').filter(Boolean)
    const profile = await gmail.users.getProfile({ userId: 'me' })
    newHistoryId = profile.data.historyId ?? undefined
    console.log(`[emailScanner] fallback fetched ${messageIds.length} messages`)
  }

  let scanned = 0
  let newMatches = 0
  let autoApplied = 0

  // Deduplicate against already-seen messages
  const existingIds = new Set(
    (await db.select({ gid: emails.gmail_message_id }).from(emails)).map((r) => r.gid)
  )

  console.log(`[emailScanner] processing ${messageIds.length} messages (${existingIds.size} already seen)`)

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
    } catch (err) {
      console.warn(`[emailScanner] failed to fetch message ${msgId}:`, err)
      continue
    }

    scanned++
    const fromDomain = raw.fromAddress.split('@')[1] ?? ''
    const candidate = isCandidate(raw.subject, raw.snippet, fromDomain, companyDomains)
    console.log(`[emailScanner] msg ${msgId}: subject="${raw.subject}" from="${raw.fromAddress}" candidate=${candidate}`)

    if (!candidate) continue

    // Run LLM classification
    const classification = await classifyEmail({
      from_name: raw.fromName,
      from_address: raw.fromAddress,
      subject: raw.subject,
      received_at: new Date(raw.receivedAt).toISOString(),
      body: raw.body || raw.snippet,
    })

    if (!classification) {
      console.warn(`[emailScanner] classification failed for msg ${msgId}, skipping`)
      continue
    }

    if (classification.classification === 'unrelated') {
      console.log(`[emailScanner] msg ${msgId} classified as unrelated, skipping`)
      continue
    }

    // Fuzzy-match to an application
    const linked = await findMatchingApplication(
      classification.company_guess,
      classification.role_guess
    )
    const linkedAppId = linked?.appId ?? null
    const linkedCompanyId = linked?.companyId ?? null

    // Find matching status for suggestion
    let suggestedStatusId: string | null = null
    if (classification.confidence >= 0.5) {
      const statusMap: Record<string, string[]> = {
        rejection:        ['rejected', 'rejection'],
        interview_invite: ['hr interview', 'tech interview', 'interview'],
        offer:            ['offer'],
        acknowledgment:   ['acknowledged'],
      }
      const keywords = statusMap[classification.classification] ?? []
      if (keywords.length > 0) {
        const allStatuses = await db.select().from(statuses)
        const match = allStatuses.find((s) =>
          keywords.some((kw) => s.name.toLowerCase().includes(kw))
        )
        suggestedStatusId = match?.id ?? null
        console.log(`[emailScanner] suggestedStatusId=${suggestedStatusId} (looked for: ${keywords.join(', ')})`)
      }
    }

    const canAutoApply = !!(linkedAppId && suggestedStatusId && classification.confidence >= AUTO_APPLY_THRESHOLD)
    console.log(`[emailScanner] canAutoApply=${canAutoApply} (linkedAppId=${linkedAppId}, suggestedStatusId=${suggestedStatusId}, confidence=${classification.confidence})`)

    if (canAutoApply) {
      try {
        const { changeStatus } = await import('./applications')
        await changeStatus({
          id: linkedAppId!,
          status_id: suggestedStatusId!,
          note: `Auto-applied from email: ${raw.subject}`,
          source: 'email',
        })
        console.log(`[emailScanner] auto-applied status change for app ${linkedAppId}`)
        autoApplied++
      } catch (err) {
        console.error('[emailScanner] auto-apply changeStatus failed:', err)
      }
    } else {
      newMatches++
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
      linked_company_id: linkedCompanyId,
      user_action: canAutoApply ? 'accepted' : 'pending',
      raw_llm_output: JSON.stringify(classification),
      processed_at: now,
    })
  }

  if (newHistoryId) {
    await setLastHistoryId(newHistoryId)
    console.log(`[emailScanner] saved newHistoryId=${newHistoryId}`)
  }

  console.log(`[emailScanner] done: scanned=${scanned} autoApplied=${autoApplied} newMatches=${newMatches}`)
  return { scanned, newMatches, autoApplied }
}

export async function getPendingEmails() {
  const db = getDb()
  return db
    .select()
    .from(emails)
    .where(eq(emails.user_action, 'pending'))
}

export async function getRecentEmails(limit = 50) {
  const db = getDb()
  return db
    .select()
    .from(emails)
    .where(inArray(emails.user_action, ['accepted', 'dismissed']))
    .orderBy(desc(emails.processed_at))
    .limit(limit)
}

export async function acceptEmailSuggestion(id: string, statusId?: string): Promise<void> {
  const db = getDb()
  const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1)
  if (!email) return

  const resolvedStatusId = statusId ?? email.suggested_status_id ?? null

  await db.update(emails).set({ user_action: 'accepted', suggested_status_id: resolvedStatusId }).where(eq(emails.id, id))

  if (email.linked_application_id && resolvedStatusId) {
    const { changeStatus } = await import('./applications')
    await changeStatus({
      id: email.linked_application_id,
      status_id: resolvedStatusId,
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

export async function draftInterviewReply(emailId: string): Promise<string> {
  const db = getDb()
  const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1)
  if (!email) throw new Error('Email not found')

  let company = '', role = ''
  if (email.linked_application_id) {
    const [row] = await db
      .select({ companyName: companies.name, roleTitle: applications.role_title })
      .from(applications)
      .innerJoin(companies, eq(applications.company_id, companies.id))
      .where(eq(applications.id, email.linked_application_id))
      .limit(1)
    if (row) { company = row.companyName; role = row.roleTitle }
  }

  const model = (await getSetting('ollama_model')) ?? 'qwen2.5:3b-instruct'
  const prompt = `Write a short professional email accepting an interview invitation (2-3 sentences, no subject line).
From: ${email.from_name ?? ''}  Subject: ${email.subject ?? ''}
Company: ${company}  Role: ${role}
Snippet: ${email.body_snippet ?? ''}`

  let draft = ''
  for await (const token of streamGenerate(model, prompt)) draft += token
  return draft.trim()
}
