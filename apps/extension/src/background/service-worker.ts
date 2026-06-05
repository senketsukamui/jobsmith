// ─── Health ping ─────────────────────────────────────────────────────────────

async function getPort(): Promise<number | null> {
  const stored = await chrome.storage.local.get('server_port')
  return (stored.server_port as number) ?? null
}

async function pingHealth(): Promise<void> {
  const port = await getPort()
  if (!port) return

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000),
    })
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

pingHealth()
setInterval(pingHealth, 60_000)
