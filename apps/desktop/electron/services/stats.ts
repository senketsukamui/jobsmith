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
  responseRate: number | null      // % that ever reached interview or later
  offerRate: number | null         // % that ever reached offer/hired
  rejectionRate: number | null     // % that ever hit a rejection status
  funnel: { status_id: string; status_name: string; status_color: string; display_order: number; count: number; pct: number }[]
  bySource: Record<string, number>
  weeklyBuckets: { week: string; count: number }[]
  avgDaysToRejection: number | null
  avgDaysToFirstInterview: number | null
}

const INTERVIEW_KW = ['interview', 'screen', 'phone', 'technical', 'take-home', 'takehome', 'assessment', 'offer', 'hired', 'accepted']
const OFFER_KW = ['offer', 'hired', 'accepted']
const REJECTION_KW = ['reject', 'declined', 'withdrawn', 'no offer']

function matchesAny(name: string, keywords: string[]) {
  return keywords.some((kw) => name.includes(kw))
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

  const baseApps = allApps.filter((a) => {
    if (!includeArchived && a.archived !== 0) return false
    if (sourceFilter && a.source !== sourceFilter) return false
    return true
  })

  const total = baseApps.length
  const baseAppIds = new Set(baseApps.map((a) => a.id))

  const allStatuses = await db.select().from(statuses).orderBy(asc(statuses.display_order))

  const statusCountMap: Record<string, number> = {}
  for (const a of baseApps) {
    statusCountMap[a.current_status_id] = (statusCountMap[a.current_status_id] ?? 0) + 1
  }
  const funnel = allStatuses.map((s) => {
    const count = statusCountMap[s.id] ?? 0
    return {
      status_id: s.id,
      status_name: s.name,
      status_color: s.color,
      display_order: s.display_order,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    }
  })

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

  const appsReachedInterview = new Set<string>()
  const appsReachedOffer = new Set<string>()
  const appsRejected = new Set<string>()

  for (const row of historyRows) {
    if (!baseAppIds.has(row.application_id)) continue
    const name = row.status_name.toLowerCase()

    if (matchesAny(name, INTERVIEW_KW)) appsReachedInterview.add(row.application_id)
    if (matchesAny(name, OFFER_KW)) appsReachedOffer.add(row.application_id)
    if (matchesAny(name, REJECTION_KW)) appsRejected.add(row.application_id)

    const appliedAt = appAppliedAt[row.application_id]
    if (!appliedAt) continue
    if (row.is_terminal === 1 && matchesAny(name, REJECTION_KW) && !seenRejection.has(row.application_id)) {
      seenRejection.add(row.application_id)
      firstRejectionDays.push((row.changed_at - appliedAt) / 86_400_000)
    }
    if (matchesAny(name, INTERVIEW_KW) && !seenInterview.has(row.application_id)) {
      seenInterview.add(row.application_id)
      firstInterviewDays.push((row.changed_at - appliedAt) / 86_400_000)
    }
  }

  // Also check current status in case app has no history entries yet
  for (const a of baseApps) {
    const status = allStatuses.find((s) => s.id === a.current_status_id)
    if (!status) continue
    const name = status.name.toLowerCase()
    if (matchesAny(name, INTERVIEW_KW)) appsReachedInterview.add(a.id)
    if (matchesAny(name, OFFER_KW)) appsReachedOffer.add(a.id)
    if (matchesAny(name, REJECTION_KW)) appsRejected.add(a.id)
  }

  const pct = (n: number) => (total === 0 ? null : Math.round((n / total) * 100))
  const avg = (arr: number[]) =>
    arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)

  return {
    total,
    totalActive,
    totalArchived,
    responseRate: pct(appsReachedInterview.size),
    offerRate: pct(appsReachedOffer.size),
    rejectionRate: pct(appsRejected.size),
    funnel,
    bySource,
    weeklyBuckets,
    avgDaysToRejection: avg(firstRejectionDays),
    avgDaysToFirstInterview: avg(firstInterviewDays),
  }
}
