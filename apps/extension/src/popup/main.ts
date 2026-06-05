import type { JobData } from '../content/sites'

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getStorage<T>(keys: string[]): Promise<Record<string, T>> {
  return chrome.storage.local.get(keys) as Promise<Record<string, T>>
}

async function setStorage(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items)
}

// ─── Server discovery ─────────────────────────────────────────────────────────

const PORT_MIN = 53700
const PORT_MAX = 53800

async function discoverPort(token: string): Promise<number | null> {
  const stored = await getStorage<number>(['server_port'])
  if (stored.server_port) {
    try {
      const res = await fetch(`http://127.0.0.1:${stored.server_port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) return stored.server_port as number
    } catch { /* fall through to scan */ }
  }

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      })
      if (res.ok) {
        await setStorage({ server_port: port })
        return port
      }
    } catch { /* continue */ }
  }

  void token
  return null
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const pairingView = document.getElementById('pairing-view')!
const mainView = document.getElementById('main-view')!
const connectionBadge = document.getElementById('connection-badge')!
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement
const pairError = document.getElementById('pair-error')!
const unpairBtn = document.getElementById('unpair-btn') as HTMLButtonElement
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
const statusMsg = document.getElementById('status-msg')!
const copyFallback = document.getElementById('copy-fallback')!
const copyJson = document.getElementById('copy-json') as HTMLTextAreaElement
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement

const fieldCompany = document.getElementById('company') as HTMLInputElement
const fieldRole = document.getElementById('role') as HTMLInputElement
const fieldSource = document.getElementById('source') as HTMLSelectElement
const fieldAppliedAt = document.getElementById('applied-at') as HTMLInputElement
const fieldJobUrl = document.getElementById('job-url') as HTMLInputElement

const clipHeader = document.getElementById('clip-header')!
const clipStatus = document.getElementById('clip-status')!
const clipToggle = document.getElementById('clip-toggle')!
const clipPreview = document.getElementById('clip-preview') as HTMLTextAreaElement

// ─── State ────────────────────────────────────────────────────────────────────

let capturedMarkdown = ''

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function showStatus(msg: string, type: 'success' | 'error' | '') {
  statusMsg.textContent = msg
  statusMsg.className = type
}

function setMainView(token: string, port: number | null) {
  pairingView.classList.remove('visible')
  mainView.classList.remove('hidden')
  connectionBadge.textContent = port ? 'Connected' : 'App offline'
  connectionBadge.className = 'header-badge' + (port ? ' connected' : '')
  void token
}

function showPairingView() {
  pairingView.classList.add('visible')
  mainView.classList.add('hidden')
  connectionBadge.textContent = 'Not paired'
  connectionBadge.className = 'header-badge'
}

// ─── Clip preview toggle ──────────────────────────────────────────────────────

let previewOpen = false
clipHeader.addEventListener('click', () => {
  previewOpen = !previewOpen
  clipPreview.style.display = previewOpen ? 'block' : 'none'
  clipToggle.textContent = previewOpen ? '▼ Hide' : '▶ Show'
})

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const stored = await getStorage<string>(['bearer_token', 'server_port'])
  const token = stored.bearer_token as string | undefined

  if (!token) {
    showPairingView()
    return
  }

  const port = await discoverPort(token)
  setMainView(token, port)
  fieldAppliedAt.value = todayISO()

  // Get active tab, pre-fill URL, then request on-demand clip
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    const url = tab?.url ?? ''
    if (url.startsWith('http')) fieldJobUrl.value = url

    const tabId = tab?.id
    if (!tabId) {
      clipStatus.textContent = 'No active tab'
      return
    }

    chrome.tabs.sendMessage(tabId, { type: 'JT_EXTRACT' }, (jobData: JobData | undefined) => {
      if (chrome.runtime.lastError || !jobData) {
        clipStatus.textContent = 'Could not clip page'
        return
      }

      capturedMarkdown = jobData.pageMarkdown

      if (jobData.company) fieldCompany.value = jobData.company
      if (jobData.role) fieldRole.value = jobData.role
      if (jobData.jobUrl) fieldJobUrl.value = jobData.jobUrl
      if (jobData.source) fieldSource.value = jobData.source

      const words = wordCount(capturedMarkdown)
      clipStatus.textContent = words > 0 ? `Clipped — ${words.toLocaleString()} words` : 'No content clipped'
      clipPreview.value = capturedMarkdown.slice(0, 3000) + (capturedMarkdown.length > 3000 ? '\n…' : '')
    })
  })
}

// ─── Pairing ─────────────────────────────────────────────────────────────────

pairBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim()
  if (!token) { pairError.textContent = 'Please paste your token.'; return }

  pairBtn.disabled = true
  pairError.textContent = ''

  const port = await discoverPort(token)
  if (!port) {
    pairError.textContent = 'Desktop app not running or not reachable.'
    pairBtn.disabled = false
    return
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/statuses`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      pairError.textContent = 'Token invalid.'
      pairBtn.disabled = false
      return
    }
  } catch {
    pairError.textContent = 'Could not verify token.'
    pairBtn.disabled = false
    return
  }

  await setStorage({ bearer_token: token, server_port: port })
  setMainView(token, port)
  pairBtn.disabled = false
})

// ─── Unpair ───────────────────────────────────────────────────────────────────

unpairBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['bearer_token', 'server_port'])
  showPairingView()
})

// ─── Submit ───────────────────────────────────────────────────────────────────

submitBtn.addEventListener('click', async () => {
  const company = fieldCompany.value.trim()
  const role = fieldRole.value.trim()
  if (!company) { showStatus('Company is required.', 'error'); return }
  if (!role) { showStatus('Role is required.', 'error'); return }

  submitBtn.disabled = true
  showStatus('Saving…', '')
  copyFallback.style.display = 'none'

  const stored = await getStorage<string>(['bearer_token', 'server_port'])
  const token = stored.bearer_token as string
  const port = Number(stored.server_port)

  const payload = {
    company: { name: company },
    role_title: role,
    page_markdown: capturedMarkdown || undefined,
    job_url: fieldJobUrl.value.trim() || undefined,
    source: fieldSource.value,
    applied_at: fieldAppliedAt.value
      ? new Date(fieldAppliedAt.value).getTime()
      : undefined,
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      showStatus('Saved to tracker ✓', 'success')
      setTimeout(() => window.close(), 1500)
    } else {
      const body = await res.json().catch(() => ({}))
      const msg = (body as { error?: string }).error ?? `Error ${res.status}`
      showStatus(msg, 'error')
      offerCopyFallback(payload)
    }
  } catch {
    showStatus('App not running or unreachable.', 'error')
    offerCopyFallback(payload)
  } finally {
    submitBtn.disabled = false
  }
})

function offerCopyFallback(payload: unknown) {
  copyJson.value = JSON.stringify(payload, null, 2)
  copyFallback.style.display = 'block'
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(copyJson.value)
  copyBtn.textContent = 'Copied!'
  setTimeout(() => { copyBtn.textContent = 'Copy JSON' }, 2000)
})

// ─── Boot ─────────────────────────────────────────────────────────────────────

init()
