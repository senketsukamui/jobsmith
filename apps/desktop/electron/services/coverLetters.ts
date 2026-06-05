import { eq, desc } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { cover_letters, applications, companies, cvs } from '../db/schema'
import { getSetting } from './settings'
import { getCvText } from './cvs'
import { streamGenerate } from './ollama'
import type { CoverLetter } from '@jobsmith/shared'

const PROMPT_PATH = path.join(__dirname, '../services/llm/prompts/cover-letter.md')

function loadPromptTemplate(): string {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf-8')
  } catch {
    // fallback inline template
    return `You are helping write a cover letter.\n\nCV:\n{cv_extracted_text}\n\nCompany: {company_name}\nRole: {role_title}\nJD: {job_description}\nInstructions: {custom_instructions}\n\nWrite a 250-350 word cover letter body only.`
  }
}

function buildPrompt(vars: {
  cv_extracted_text: string
  company_name: string
  role_title: string
  job_description: string
  custom_instructions: string
}): string {
  return loadPromptTemplate()
    .replace('{cv_extracted_text}', vars.cv_extracted_text)
    .replace('{company_name}', vars.company_name)
    .replace('{role_title}', vars.role_title)
    .replace('{job_description}', vars.job_description)
    .replace('{custom_instructions}', vars.custom_instructions)
}

export async function* generateCoverLetter(input: {
  application_id: string
  cv_id?: string | null
  custom_instructions?: string | null
}): AsyncGenerator<{ chunk?: string; id?: string; generation_time_ms?: number; error?: string }> {
  const db = getDb()

  // Fetch application + company
  const [appRow] = await db
    .select({ app: applications, company: companies })
    .from(applications)
    .innerJoin(companies, eq(applications.company_id, companies.id))
    .where(eq(applications.id, input.application_id))
    .limit(1)

  if (!appRow) {
    yield { error: 'Application not found' }
    return
  }

  // Resolve CV: explicit > application's cv > default cv
  let cvId = input.cv_id ?? appRow.app.cv_id
  if (!cvId) {
    const [defaultCv] = await db
      .select({ id: cvs.id })
      .from(cvs)
      .where(eq(cvs.is_default, 1))
      .limit(1)
    cvId = defaultCv?.id ?? null
  }

  const cvText = cvId ? await getCvText(cvId) : null

  const model = (await getSetting('ollama_model')) ?? 'qwen2.5:3b-instruct'
  const prompt = buildPrompt({
    cv_extracted_text: cvText ?? '(no CV provided)',
    company_name: appRow.company.name,
    role_title: appRow.app.role_title,
    job_description: appRow.app.job_description ?? '(no job description provided)',
    custom_instructions: input.custom_instructions ?? 'none',
  })

  let generated = ''
  const start = Date.now()

  try {
    for await (const token of streamGenerate(model, prompt)) {
      generated += token
      yield { chunk: token }
    }
  } catch (err) {
    yield { error: String(err) }
    return
  }

  const generation_time_ms = Date.now() - start
  const now = Date.now()
  const id = uuidv7()

  await db.insert(cover_letters).values({
    id,
    application_id: input.application_id,
    cv_id: cvId ?? null,
    custom_instructions: input.custom_instructions ?? null,
    generated_content: generated,
    model_used: model,
    generation_time_ms,
    is_edited: 0,
    created_at: now,
    updated_at: now,
  })

  yield { id, generation_time_ms }
}

export async function listCoverLetters(applicationId: string): Promise<CoverLetter[]> {
  const db = getDb()
  return db
    .select()
    .from(cover_letters)
    .where(eq(cover_letters.application_id, applicationId))
    .orderBy(desc(cover_letters.created_at))
}

export async function updateCoverLetter(
  id: string,
  content: string
): Promise<CoverLetter> {
  const db = getDb()
  const now = Date.now()
  const rows = await db
    .select({ generated: cover_letters.generated_content })
    .from(cover_letters)
    .where(eq(cover_letters.id, id))
    .limit(1)

  const isEdited = rows[0] && content !== rows[0].generated ? 1 : 0
  await db
    .update(cover_letters)
    .set({ generated_content: content, is_edited: isEdited, updated_at: now })
    .where(eq(cover_letters.id, id))

  return (await db.select().from(cover_letters).where(eq(cover_letters.id, id)))[0]
}

export async function deleteCoverLetter(id: string): Promise<void> {
  const db = getDb()
  await db.delete(cover_letters).where(eq(cover_letters.id, id))
}
