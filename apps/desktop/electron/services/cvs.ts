import { eq } from 'drizzle-orm'
import { dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { uuidv7 } from 'uuidv7'
import { getDb } from '../db/client'
import { cvs, applications } from '../db/schema'
import type { Cv } from '@jobsmith/shared'

function getCvDir() {
  const dir = path.join(app.getPath('userData'), 'cvs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function extractText(filePath: string, mimeType: string): Promise<string> {
  const buf = fs.readFileSync(filePath)

  if (mimeType === 'application/pdf') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfModule = await import('pdf-parse') as any
    const pdfParse = pdfModule.default ?? pdfModule
    const data = await pdfParse(buf)
    return data.text.trim()
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: buf })
    return result.value.trim()
  }

  throw new Error(`Unsupported file type: ${mimeType}`)
}

export async function uploadCv(): Promise<Cv | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select your CV',
    filters: [
      { name: 'Documents', extensions: ['pdf', 'docx', 'doc'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const srcPath = result.filePaths[0]
  const originalFilename = path.basename(srcPath)
  const ext = path.extname(srcPath).toLowerCase()
  const mimeType =
    ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const id = uuidv7()
  const destFilename = `${id}${ext}`
  const destPath = path.join(getCvDir(), destFilename)
  fs.copyFileSync(srcPath, destPath)

  let extractedText: string | null = null
  try {
    extractedText = await extractText(destPath, mimeType)
  } catch {
    // extraction failure is non-fatal; user can paste text manually later
  }

  // strip cv extension from name as display label
  const displayName = originalFilename.replace(/\.(pdf|docx|doc)$/i, '')

  const db = getDb()
  const now = Date.now()
  await db.insert(cvs).values({
    id,
    name: displayName,
    file_path: destFilename,
    original_filename: originalFilename,
    mime_type: mimeType,
    extracted_text: extractedText,
    is_default: 0,
    created_at: now,
    updated_at: now,
  })

  return (await db.select().from(cvs).where(eq(cvs.id, id)))[0]
}

export async function listCvs(): Promise<Omit<Cv, 'extracted_text'>[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: cvs.id,
      name: cvs.name,
      file_path: cvs.file_path,
      original_filename: cvs.original_filename,
      mime_type: cvs.mime_type,
      is_default: cvs.is_default,
      created_at: cvs.created_at,
      updated_at: cvs.updated_at,
    })
    .from(cvs)
    .orderBy(cvs.created_at)
  return rows
}

export async function setDefaultCv(id: string): Promise<void> {
  const db = getDb()
  const now = Date.now()
  await db.update(cvs).set({ is_default: 0, updated_at: now })
  await db.update(cvs).set({ is_default: 1, updated_at: now }).where(eq(cvs.id, id))
}

export async function deleteCv(id: string): Promise<void> {
  const db = getDb()
  const row = await db.select({ file_path: cvs.file_path }).from(cvs).where(eq(cvs.id, id)).limit(1)

  // Null out cv_id on any applications referencing this CV
  await db.update(applications).set({ cv_id: null }).where(eq(applications.cv_id, id))

  await db.delete(cvs).where(eq(cvs.id, id))

  // Remove file from disk (best-effort)
  if (row[0]) {
    const filePath = path.join(getCvDir(), row[0].file_path)
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
  }
}

export async function updateCvText(id: string, text: string): Promise<void> {
  const db = getDb()
  await db.update(cvs).set({ extracted_text: text, updated_at: Date.now() }).where(eq(cvs.id, id))
}

export async function getCvText(id: string): Promise<string | null> {
  const db = getDb()
  const rows = await db.select({ extracted_text: cvs.extracted_text }).from(cvs).where(eq(cvs.id, id)).limit(1)
  return rows[0]?.extracted_text ?? null
}
