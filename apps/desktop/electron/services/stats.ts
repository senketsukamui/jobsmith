import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { applications, statuses, application_status_history } from '../db/schema'

export interface StatsInput {
  weekCount?: number
  includeArchived?: boolean
  source?: string
}

export interface StatsResult {
  total: number
  totalActive: number
  totalArchived: number
  responseRate: number | null
  funnel: { status_id: string; status_name: string; status_color: string; display_order: number; count: number }[]
  bySource: Record<string, number>
  weeklyBuckets: { week: string; count: number }[]
  avgDaysToRejection: number | null
  avgDaysToFirstInterview: number | null
}

function isoWeek(ts: number): string {
  const d = new Date(ts)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const year = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86_400_000 + (jan4.getUTCDay() || 7)) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function startOfWeekUTC(weeksAgo: number): number {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (day - 1) - weeksAgo * 7)
  return d.getTime()
}

export async function getStats(input: StatsInput = {}): Promise<StatsResult> {
  const db = getDb()
  const weekCount = Math.max(1, Math.min(52, input.weekCount ?? 8))
  const includeArchived = input.includeArchived ?? false
  const sourceFilter = input.source || undefined

  const allApps = await db
    .select({
      id: applications.id,
      archived: applications.archived,
      current_status_id: applications.current_status_id,
      source: applications.source,
      applied_at: applications.applied_at,
    })
    .from(applications)

  const totalActive = allApps.filter((a) => a.archived === 0).length
  const totalArchived = allApps.length - totalActive

  // base set respects includeArchived + source filters
  const baseApps = allApps.filter((a) => {
    if (!includeArchived && a.archived !== 0) return false
    if (sourceFilter && a.source !== sourceFilter) return false
    return true
  })

  const total = baseApps.length

  const allStatuses = await db.select().from(statuses).orderBy(asc(statuses.display_order))
  const defaultStatus = allStatuses.find((s) => s.is_default_new === 1)

  const responseRate: number | null = (() => {
    if (total === 0 || !defaultStatus) return null
    const responded = baseApps.filter((a) => a.current_status_id !== defaultStatus.id).length
    return Math.round((responded / total) * 100)
  })()

  const statusCountMap: Record<string, number> = {}
  for (const a of baseApps) {
    statusCountMap[a.current_status_id] = (statusCountMap[a.current_status_id] ?? 0) + 1
  }
  const funnel = allStatuses.map((s) => ({
    status_id: s.id,
    status_name: s.name,
    status_color: s.color,
    display_order: s.display_order,
    count: statusCountMap[s.id] ?? 0,
  }))

  const bySource: Record<string, number> = {}
  for (const a of baseApps) {
    bySource[a.source] = (bySource[a.source] ?? 0) + 1
  }

  const windowStart = startOfWeekUTC(weekCount - 1)
  const recentApps = baseApps.filter((a) => (a.applied_at ?? 0) >= windowStart)
  const weekKeys: string[] = []
  for (let i = weekCount - 1; i >= 0; i--) {
    weekKeys.push(isoWeek(startOfWeekUTC(i)))
  }
  const weekCountMap: Record<string, number> = {}
  for (const a of recentApps) {
    if (!a.applied_at) continue
    const w = isoWeek(a.applied_at)
    weekCountMap[w] = (weekCountMap[w] ?? 0) + 1
  }
  const weeklyBuckets = weekKeys.map((week) => ({ week, count: weekCountMap[week] ?? 0 }))

  const baseAppIds = new Set(baseApps.map((a) => a.id))

  const historyRows = await db
    .select({
      application_id: application_status_history.application_id,
      changed_at: application_status_history.changed_at,
      status_name: statuses.name,
      is_terminal: statuses.is_terminal,
    })
    .from(application_status_history)
    .innerJoin(statuses, eq(application_status_history.status_id, statuses.id))

  const appAppliedAt: Record<string, number | null> = {}
  for (const a of baseApps) appAppliedAt[a.id] = a.applied_at

  const firstRejectionDays: number[] = []
  const firstInterviewDays: number[] = []
  const seenRejection = new Set<string>()
  const seenInterview = new Set<string>()

  for (const row of historyRows) {
    if (!baseAppIds.has(row.application_id)) continue
    const appliedAt = appAppliedAt[row.application_id]
    if (!appliedAt) continue
    const name = row.status_name.toLowerCase()
    if (row.is_terminal === 1 && name.includes('reject') && !seenRejection.has(row.application_id)) {
      seenRejection.add(row.application_id)
      firstRejectionDays.push((row.changed_at - appliedAt) / 86_400_000)
    }
    if (name.includes('interview') && !seenInterview.has(row.application_id)) {
      seenInterview.add(row.application_id)
      firstInterviewDays.push((row.changed_at - appliedAt) / 86_400_000)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)

  return {
    total,
    totalActive,
    totalArchived,
    responseRate,
    funnel,
    bySource,
    weeklyBuckets,
    avgDaysToRejection: avg(firstRejectionDays),
    avgDaysToFirstInterview: avg(firstInterviewDays),
  }
}
