import * as cron from 'node-cron'
import { isConnected } from './gmail'
import { scanEmails } from './emailScanner'
import { getSetting } from './settings'
import { getStaleApplications, autoGhostStaleApplications } from './applications'
import { notify, updateBadgeCount } from './notifications'

let emailTask: cron.ScheduledTask | null = null
let followUpTask: cron.ScheduledTask | null = null

export async function startScheduler(): Promise<void> {
  // Run auto-ghost check immediately on startup to catch pre-existing stale apps
  autoGhostStaleApplications().catch(() => {})

  const intervalMinutes = parseInt((await getSetting('scan_interval_minutes')) ?? '30', 10)
  const cronExpr = `*/${intervalMinutes} * * * *`

  emailTask = cron.schedule(cronExpr, async () => {
    try {
      if (!(await isConnected())) return
      const result = await scanEmails()
      const notifEnabled = (await getSetting('notification_enabled')) !== '0'
      if (notifEnabled && (result.autoApplied > 0 || result.newMatches > 0)) {
        const msg: string[] = []
        if (result.autoApplied > 0)
          msg.push(`${result.autoApplied} status update${result.autoApplied > 1 ? 's' : ''} applied automatically`)
        if (result.newMatches > 0)
          msg.push(`${result.newMatches} email${result.newMatches > 1 ? 's' : ''} need review`)
        notify('Jobsmith', msg.join(' · '))
      }
      await updateBadgeCount()
    } catch { /* errors logged elsewhere */ }
  })

  // Daily 9am: auto-ghost stale applied apps + follow-up reminders
  followUpTask = cron.schedule('0 9 * * *', async () => {
    try {
      // Auto-ghost applications stuck in Applied for 3+ weeks
      const ghosted = await autoGhostStaleApplications()
      const notifEnabled = (await getSetting('notification_enabled')) !== '0'
      if (ghosted > 0 && notifEnabled) {
        notify(
          'Jobsmith',
          `${ghosted} application${ghosted > 1 ? 's were' : ' was'} marked Ghosted after 3 weeks with no response.`
        )
      }

      // Follow-up reminders for other non-terminal apps
      const thresholdDays = parseInt((await getSetting('follow_up_days')) ?? '7', 10)
      const stale = await getStaleApplications(thresholdDays)
      if (stale.length > 0 && notifEnabled) {
        notify(
          'Jobsmith',
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
