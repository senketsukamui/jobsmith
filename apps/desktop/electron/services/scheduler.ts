import * as cron from 'node-cron'
import { isConnected } from './gmail'
import { scanEmails } from './emailScanner'
import { getSetting } from './settings'

let task: cron.ScheduledTask | null = null

export async function startScheduler(): Promise<void> {
  const intervalMinutes = parseInt((await getSetting('scan_interval_minutes')) ?? '30', 10)
  const cronExpr = `*/${intervalMinutes} * * * *`

  task = cron.schedule(cronExpr, async () => {
    try {
      if (!(await isConnected())) return
      await scanEmails()
    } catch { /* errors logged elsewhere */ }
  })
}

export function stopScheduler(): void {
  task?.stop()
  task = null
}

export async function restartScheduler(): Promise<void> {
  stopScheduler()
  await startScheduler()
}
