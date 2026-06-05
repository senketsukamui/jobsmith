import { and, desc, eq, inArray, like, or } from 'drizzle-orm'
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
import type {
  ApplicationWithRelations,
  ApplicationStatusHistoryWithStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  ChangeStatusInput,
  ListApplicationsInput,
} from '@job-tracker/shared'

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
