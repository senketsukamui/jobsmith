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
  // Try previously stored port first
  const stored = await getStorage<number>(['server_port'])
  if (stored.server_port) {
    try {
      const res = await fetch(`http://127.0.0.1:${stored.server_port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) return stored.server_port as number
    } catch { /* fall through to scan */ }
  }

  // Port scan fallback
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

  void token // suppress lint warning
  return null
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

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
const fieldJobDescription = document.getElementById('job-description') as HTMLTextAreaElement

// ─── State ────────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10)
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

  // Pre-fill from content script via background
  chrome.runtime.sendMessage({ type: 'GET_TAB_JOB_DATA' }, (jobData) => {
    if (!jobData) return
    if (jobData.company) fieldCompany.value = jobData.company
    if (jobData.role) fieldRole.value = jobData.role
    if (jobData.jobDescription) fieldJobDescription.value = jobData.jobDescription
    if (jobData.jobUrl) fieldJobUrl.value = jobData.jobUrl
    if (jobData.source) fieldSource.value = jobData.source
  })

  // Pre-fill URL from active tab if no content script data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url ?? ''
    if (!fieldJobUrl.value && url.startsWith('http')) fieldJobUrl.value = url
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

  // Verify token
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
    job_description: fieldJobDescription.value.trim() || undefined,
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
      signal: AbortSignal.timeout(8000),
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
  } catch (err) {
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
