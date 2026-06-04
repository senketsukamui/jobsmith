import { JOB_DATA_MSG } from '../content/sites'
import type { JobData } from '../content/sites'

// Store latest job data per tab
const tabJobData = new Map<number, Partial<JobData>>()

// Receive job data from content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === JOB_DATA_MSG && sender.tab?.id != null) {
    tabJobData.set(sender.tab.id, msg.data)
  }
})

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabJobData.delete(tabId)
})

// Expose tab job data to popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_TAB_JOB_DATA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      sendResponse(tabId != null ? tabJobData.get(tabId) ?? null : null)
    })
    return true // keep channel open for async response
  }
  return false
})

// ─── Health ping every 60 s ──────────────────────────────────────────────────

async function getPort(): Promise<number | null> {
  const stored = await chrome.storage.local.get('server_port')
  return (stored.server_port as number) ?? null
}

async function pingHealth(): Promise<void> {
  const port = await getPort()
  if (!port) return

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      chrome.action.setBadgeText({ text: '' })
    } else {
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
    }
  } catch {
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
  }
}

// Ping immediately and then every 60 s
pingHealth()
setInterval(pingHealth, 60_000)
