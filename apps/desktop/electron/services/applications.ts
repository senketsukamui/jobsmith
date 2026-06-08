import { and, desc, eq, inArray, like, lt, or } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import {
  applications,
  application_status_history,
  companies,
  statuses,
} from '../db/schema'
import { upsertCompanyByName } from './companies'
import { getDefaultStatus } from './statuses'
import { streamGenerate } from './ollama'
import { getSetting } from './settings'
import type {
  ApplicationWithRelations,
  ApplicationStatusHistoryWithStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  ChangeStatusInput,
  ListApplicationsInput,
} from '@jobsmith/shared'

export async function listApplications(
  input: ListApplicationsInput
): Promise<ApplicationWithRelations[]> {
  const db = getDb()
  const filters = []

  if (!input.archived) {
    filters.push(eq(applications.archived, 0))
  }
  if (input.status_ids && input.status_ids.length > 0) {
    filters.push(inArray(applications.current_status_id, input.status_ids))
  }
  if (input.source) {
    filters.push(eq(applications.source, input.source))
  }
  if (input.query && input.query.trim()) {
    const q = `%${input.query.trim()}%`
    filters.push(or(like(companies.name, q), like(applications.role_title, q)))
  }

  const rows = await db
    .select({
      application: applications,
      company: companies,
      status: statuses,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))
    .innerJoin(statuses, eq(applications.current_status_id, statuses.id))
    .where(and(...filters))
    .orderBy(desc(applications.last_activity_at))

  return rows.map((r) => ({ ...r.application, company: r.company, status: r.status }))
}

export async function createApplication(
  input: CreateApplicationInput
): Promise<ApplicationWithRelations> {
  const db = getDb()
  const now = Date.now()
  const id = uuidv7()

  const company = await upsertCompanyByName(input.company.name, input.company.website)
  const defaultStatus = await getDefaultStatus()

  await db.insert(applications).values({
    id,
    company_id: company.id,
    role_title: input.role_title,
    job_description: input.job_description ?? null,
    job_url: input.job_url ?? null,
    source: input.source ?? 'manual',
    cv_id: input.cv_id ?? null,
    current_status_id: defaultStatus.id,
    applied_at: input.applied_at ?? now,
    last_activity_at: now,
    page_markdown: input.page_markdown ?? null,
    archived: 0,
    created_at: now,
    updated_at: now,
  })

  await db.insert(application_status_history).values({
    id: uuidv7(),
    application_id: id,
    status_id: defaultStatus.id,
    changed_at: now,
    source: 'manual',
    note: null,
  })

  const result = await getApplication(id)
  return result!
}

export async function getApplication(
  id: string
): Promise<ApplicationWithRelations | null> {
  const db = getDb()
  const rows = await db
    .select({
      application: applications,
      company: companies,
      status: statuses,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))
    .innerJoin(statuses, eq(applications.current_status_id, statuses.id))
    .where(eq(applications.id, id))
    .limit(1)

  if (rows.length === 0) return null
  const r = rows[0]
  return { ...r.application, company: r.company, status: r.status }
}

export async function updateApplication(
  input: UpdateApplicationInput
): Promise<ApplicationWithRelations> {
  const db = getDb()
  const now = Date.now()
  const patch: Record<string, unknown> = { updated_at: now }

  if (input.role_title !== undefined) patch.role_title = input.role_title
  if (input.job_description !== undefined) patch.job_description = input.job_description
  if (input.job_url !== undefined) patch.job_url = input.job_url
  if (input.source !== undefined) patch.source = input.source
  if (input.cv_id !== undefined) patch.cv_id = input.cv_id
  if (input.archived !== undefined) patch.archived = input.archived
  if (input.applied_at !== undefined) patch.applied_at = input.applied_at
  if (input.notes !== undefined) patch.notes = input.notes

  await db.update(applications).set(patch).where(eq(applications.id, input.id))
  const result = await getApplication(input.id)
  return result!
}

export async function changeStatus(
  input: ChangeStatusInput & { source?: 'manual' | 'email' | 'extension' | 'system' }
): Promise<ApplicationWithRelations> {
  const db = getDb()
  const now = Date.now()

  await db
    .update(applications)
    .set({ current_status_id: input.status_id, last_activity_at: now, updated_at: now })
    .where(eq(applications.id, input.id))

  await db.insert(application_status_history).values({
    id: uuidv7(),
    application_id: input.id,
    status_id: input.status_id,
    changed_at: now,
    source: input.source ?? 'manual',
    note: input.note ?? null,
  })

  const result = await getApplication(input.id)
  return result!
}

export async function getStaleApplications(
  thresholdDays: number
): Promise<ApplicationWithRelations[]> {
  const db = getDb()
  const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000

  const rows = await db
    .select({ application: applications, company: companies, status: statuses })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))
    .innerJoin(statuses, eq(applications.current_status_id, statuses.id))
    .where(
      and(
        eq(applications.archived, 0),
        eq(statuses.is_terminal, 0),
        lt(applications.last_activity_at, cutoff)
      )
    )
    .orderBy(desc(applications.last_activity_at))

  return rows.map((r) => ({ ...r.application, company: r.company, status: r.status }))
}

export async function autoGhostStaleApplications(): Promise<number> {
  const db = getDb()

  const allStatuses = await db.select().from(statuses)
  const applied = allStatuses.find((s) => s.name.toLowerCase() === 'applied')
  const ghosted = allStatuses.find((s) => s.name.toLowerCase() === 'ghosted')
  if (!applied || !ghosted) return 0

  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000
  const stale = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.current_status_id, applied.id),
        eq(applications.archived, 0),
        lt(applications.last_activity_at, cutoff)
      )
    )

  if (stale.length === 0) return 0

  const now = Date.now()
  for (const app of stale) {
    await db
      .update(applications)
      .set({ current_status_id: ghosted.id, last_activity_at: now, updated_at: now })
      .where(eq(applications.id, app.id))
    await db.insert(application_status_history).values({
      id: uuidv7(),
      application_id: app.id,
      status_id: ghosted.id,
      changed_at: now,
      source: 'system',
      note: 'Auto-ghosted after 3 weeks with no response.',
    })
  }

  return stale.length
}

export interface ParsedMarkdownFields {
  company_name: string
  role_title: string
  job_description: string
}

const PARSE_PROMPT_PATH = path.join(__dirname, '../services/llm/prompts/parse-markdown.md')

function loadParsePrompt(): string {
  try { return fs.readFileSync(PARSE_PROMPT_PATH, 'utf-8') } catch {
    return 'Extract company_name, role_title, job_description from this job posting as JSON.\n\nPAGE CONTENT:\n{page_markdown}'
  }
}

export async function parseApplicationMarkdown(
  id: string
): Promise<ParsedMarkdownFields> {
  const app = await getApplication(id)
  if (!app) throw new Error('Application not found')
  if (!app.page_markdown) throw new Error('No page clipping stored for this application')

  const model = (await getSetting('ollama_model')) ?? 'qwen2.5:3b-instruct'
  const prompt = loadParsePrompt().replace('{page_markdown}', app.page_markdown.slice(0, 8000))

  let raw = ''
  for await (const token of streamGenerate(model, prompt, undefined, { format: 'json' })) {
    raw += token
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const coerce = (v: unknown): string =>
    Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : ''
  return {
    company_name: coerce(parsed.company_name),
    role_title: coerce(parsed.role_title),
    job_description: coerce(parsed.job_description),
  }
}

export async function setPendingParse(id: string, pending: boolean): Promise<void> {
  const db = getDb()
  await db
    .update(applications)
    .set({ pending_parse: pending ? 1 : 0, updated_at: Date.now() })
    .where(eq(applications.id, id))
}

async function runParse(id: string): Promise<void> {
  parseApplicationMarkdown(id)
    .then(async (fields) => {
      await updateApplication({
        id,
        role_title: fields.role_title || undefined,
        job_description: fields.job_description || undefined,
      })
      await setPendingParse(id, false)
    })
    .catch(() => {})
}

export async function scheduleAutoParse(id: string): Promise<void> {
  await setPendingParse(id, true)
  runParse(id)
}

export async function retryPendingParses(): Promise<void> {
  const db = getDb()
  const pending = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.pending_parse, 1))
  for (const { id } of pending) {
    runParse(id)
  }
}

export async function deleteApplication(id: string): Promise<void> {
  const db = getDb()
  await db.delete(applications).where(eq(applications.id, id))
}

export async function getApplicationHistory(
  applicationId: string
): Promise<ApplicationStatusHistoryWithStatus[]> {
  const db = getDb()
  const rows = await db
    .select({
      history: application_status_history,
      status: statuses,
    })
    .from(application_status_history)
    .innerJoin(statuses, eq(application_status_history.status_id, statuses.id))
    .where(eq(application_status_history.application_id, applicationId))
    .orderBy(desc(application_status_history.changed_at))

  return rows.map((r) => ({ ...r.history, status: r.status }))
}
