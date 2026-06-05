import { Notification, app } from 'electron'
import { and, count, eq, lt } from 'drizzle-orm'
import { getDb } from '../db/client'
import { emails, statuses, applications } from '../db/schema'
import { getSetting } from './settings'

export function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

export async function updateBadgeCount(): Promise<void> {
  if (process.platform !== 'darwin') return

  try {
    const db = getDb()

    const [pendingRow] = await db
      .select({ cnt: count() })
      .from(emails)
      .where(eq(emails.user_action, 'pending'))
    const pendingEmails = pendingRow?.cnt ?? 0

    const thresholdDays = parseInt((await getSetting('follow_up_days')) ?? '7', 10)
    const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000

    const [staleRow] = await db
      .select({ cnt: count() })
      .from(applications)
      .innerJoin(statuses, eq(applications.current_status_id, statuses.id))
      .where(and(
        eq(applications.archived, 0),
        eq(statuses.is_terminal, 0),
        lt(applications.last_activity_at, cutoff)
      ))
    const staleApps = staleRow?.cnt ?? 0

    app.setBadgeCount(pendingEmails + staleApps)
  } catch { /* ignore — badge is cosmetic */ }
}
