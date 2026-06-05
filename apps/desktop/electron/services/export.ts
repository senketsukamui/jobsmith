import { eq } from 'drizzle-orm'
import fs from 'fs'
import { dialog } from 'electron'
import { getDb } from '../db/client'
import { applications, companies, statuses } from '../db/schema'
import { getSetting } from './settings'

// ─── Shared query ─────────────────────────────────────────────────────────────

async function fetchAllApplications() {
  const db = getDb()
  return db
    .select({
      role_title: applications.role_title,
      source: applications.source,
      applied_at: applications.applied_at,
      last_activity_at: applications.last_activity_at,
      job_url: applications.job_url,
      job_description: applications.job_description,
      archived: applications.archived,
      company_name: companies.name,
      status_name: statuses.name,
    })
    .from(applications)
    .leftJoin(companies, eq(applications.company_id, companies.id))
    .leftJoin(statuses, eq(applications.current_status_id, statuses.id))
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function escapeCell(v: string | null | undefined): string {
  const s = v ?? ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function formatDate(ts: number | null | undefined): string {
  return ts ? new Date(ts).toISOString().split('T')[0] : ''
}

export async function exportToCsv(): Promise<{ path: string } | null> {
  const rows = await fetchAllApplications()

  const headers = ['Company', 'Role', 'Status', 'Source', 'Applied', 'Last Activity', 'Job URL', 'Archived']
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        escapeCell(r.company_name),
        escapeCell(r.role_title),
        escapeCell(r.status_name),
        escapeCell(r.source),
        formatDate(r.applied_at),
        formatDate(r.last_activity_at),
        escapeCell(r.job_url),
        r.archived ? 'Yes' : 'No',
      ].join(',')
    ),
  ]

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export applications to CSV',
    defaultPath: `job-applications-${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })

  if (canceled || !filePath) return null

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
  return { path: filePath }
}

// ─── Notion ───────────────────────────────────────────────────────────────────

const NOTION_VERSION = '2022-06-28'

async function notionFetch(path: string, token: string, body?: unknown) {
  return fetch(`https://api.notion.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

export async function validateNotionConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const token = await getSetting('notion_api_key')
  const databaseId = await getSetting('notion_database_id')

  if (!token) return { ok: false, error: 'No API token configured.' }
  if (!databaseId) return { ok: false, error: 'No database ID configured.' }

  try {
    const resp = await notionFetch(`/databases/${databaseId}`, token)
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as Record<string, unknown>
      return { ok: false, error: (body.message as string | undefined) ?? `HTTP ${resp.status}` }
    }
    const data = await resp.json() as Record<string, unknown>
    const titleArr = (data.title as Array<{ plain_text?: string }> | undefined) ?? []
    const name = titleArr.map((t) => t.plain_text).join('') || 'Untitled'
    return { ok: true, name }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function exportToNotion(): Promise<{ exported: number; failed: number }> {
  const token = await getSetting('notion_api_key')
  const databaseId = await getSetting('notion_database_id')

  if (!token || !databaseId) {
    throw new Error('Configure Notion API token and database ID in Settings → Export first.')
  }

  const rows = await fetchAllApplications()

  let exported = 0
  let failed = 0

  for (const row of rows) {
    const title = [row.company_name, row.role_title].filter(Boolean).join(' — ')

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: title } }] },
    }

    if (row.company_name)
      properties['Company'] = { rich_text: [{ text: { content: row.company_name } }] }

    if (row.role_title)
      properties['Role'] = { rich_text: [{ text: { content: row.role_title } }] }

    if (row.status_name)
      properties['Status'] = { select: { name: row.status_name } }

    if (row.source)
      properties['Source'] = { select: { name: row.source } }

    if (row.applied_at)
      properties['Applied'] = { date: { start: new Date(row.applied_at).toISOString().split('T')[0] } }

    if (row.job_url)
      properties['URL'] = { url: row.job_url }

    properties['Archived'] = { checkbox: row.archived === 1 }

    const pageBody: Record<string, unknown> = {
      parent: { database_id: databaseId },
      properties,
    }

    if (row.job_description) {
      pageBody['children'] = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: row.job_description.slice(0, 2000) } }],
          },
        },
      ]
    }

    try {
      const resp = await notionFetch('/pages', token, pageBody)
      if (resp.ok) {
        exported++
      } else {
        const body = await resp.json().catch(() => ({})) as Record<string, unknown>
        console.error('[export] Notion page creation failed:', resp.status, body.message)
        failed++
      }
    } catch (err) {
      console.error('[export] Notion request error:', err)
      failed++
    }
  }

  return { exported, failed }
}
