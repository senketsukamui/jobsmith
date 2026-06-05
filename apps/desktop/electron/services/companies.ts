import { eq, like, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { companies } from '../db/schema'
import type { Company, CreateCompanyInput } from '@jobsmith/shared'

export async function listCompanies(query?: string): Promise<Company[]> {
  const db = getDb()
  if (query && query.trim()) {
    return db
      .select()
      .from(companies)
      .where(like(companies.name, `%${query.trim()}%`))
      .orderBy(companies.name)
  }
  return db.select().from(companies).orderBy(companies.name)
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const db = getDb()
  const now = Date.now()
  const id = uuidv7()
  await db.insert(companies).values({
    id,
    name: input.name,
    website: input.website ?? null,
    careers_url: input.careers_url ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  })
  return (await db.select().from(companies).where(eq(companies.id, id)))[0]
}

export async function upsertCompanyByName(
  name: string,
  website?: string
): Promise<Company> {
  const db = getDb()
  const existing = await db
    .select()
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${name})`)
    .limit(1)

  if (existing.length > 0) return existing[0]
  return createCompany({ name, website })
}
