import * as cron from 'node-cron'
import { isConnected } from './gmail'
import { scanEmails } from './emailScanner'
import { getSetting } from './settings'
import { getStaleApplications } from './applications'
import { notify, updateBadgeCount } from './notifications'

let emailTask: cron.ScheduledTask | null = null
let followUpTask: cron.ScheduledTask | null = null

export async function startScheduler(): Promise<void> {
  const intervalMinutes = parseInt((await getSetting('scan_interval_minutes')) ?? '30', 10)
  const cronExpr = `*/${intervalMinutes} * * * *`

  emailTask = cron.schedule(cronExpr, async () => {
    try {
      if (!(await isConnected())) return
      const result = await scanEmails()
      if (result.newMatches > 0) {
        const notifEnabled = (await getSetting('notification_enabled')) !== '0'
        if (notifEnabled) {
          notify(
            'Job Tracker',
            `${result.newMatches} new email match${result.newMatches > 1 ? 'es' : ''} found.`
          )
        }
      }
      await updateBadgeCount()
    } catch { /* errors logged elsewhere */ }
  })

  // Daily 9am: follow-up reminders
  followUpTask = cron.schedule('0 9 * * *', async () => {
    try {
      const notifEnabled = (await getSetting('notification_enabled')) !== '0'
      const thresholdDays = parseInt((await getSetting('follow_up_days')) ?? '7', 10)
      const stale = await getStaleApplications(thresholdDays)
      if (stale.length > 0 && notifEnabled) {
        notify(
          'Job Tracker',
          `${stale.length} application${stale.length > 1 ? 's need' : ' needs'} follow-up.`
        )
      }
      await updateBadgeCount()
    } catch { /* ignore */ }
  })
}

export function stopScheduler(): void {
  emailTask?.stop()
  emailTask = null
  followUpTask?.stop()
  followUpTask = null
}

export async function restartScheduler(): Promise<void> {
  stopScheduler()
  await startScheduler()
}
