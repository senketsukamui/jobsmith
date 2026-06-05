import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

function OllamaSection() {
  const queryClient = useQueryClient()
  const connectionQuery = trpc.ollama.checkConnection.useQuery(undefined, { retry: false })
  const modelsQuery = trpc.ollama.listModels.useQuery(undefined, { enabled: connectionQuery.data?.ok })
  const settingsQuery = trpc.settings.getAll.useQuery()

  const savedHost = settingsQuery.data?.ollama_host ?? 'http://localhost:11434'
  const savedModel = settingsQuery.data?.ollama_model ?? 'qwen2.5:7b-instruct'

  const [host, setHost] = useState('')
  const [pullModel, setPullModel] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState('')

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  trpc.ollama.pullModel.useSubscription(pullModel, {
    enabled: pulling && pullModel.length > 0,
    onData: (ev) => {
      const pct = ev.percent != null ? ` ${Math.round(ev.percent)}%` : ''
      setPullProgress(`${ev.status}${pct}`)
      if (ev.status === 'success') {
        setPulling(false)
        queryClient.invalidateQueries()
      }
    },
  })

  const models = modelsQuery.data ?? []
  const displayHost = host || savedHost

  function handleSaveHost() {
    setSetting.mutate({ key: 'ollama_host', value: displayHost })
    queryClient.invalidateQueries()
  }

  function handleSetModel(model: string) {
    setSetting.mutate({ key: 'ollama_model', value: model })
  }

  function handlePull() {
    if (!pullModel.trim()) return
    setPullProgress('')
    setPulling(true)
  }

  const isConnected = connectionQuery.data?.ok

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ollama</h2>

      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-sm">
          {connectionQuery.isLoading
            ? 'Checking connection…'
            : isConnected
            ? 'Connected'
            : `Offline — ${connectionQuery.data?.error ?? 'cannot reach Ollama'}`}
        </span>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries()}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Refresh
        </button>
      </div>

      {/* Host */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Ollama host</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={host || savedHost}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://localhost:11434"
            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={handleSaveHost}
            disabled={setSetting.isLoading}
            className="h-9 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Model select */}
      {isConnected && models.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Active model</label>
          <div className="flex gap-2">
            <select
              value={savedModel}
              onChange={(e) => handleSetModel(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Pull model */}
      {isConnected && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Pull a model</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={pullModel}
              onChange={(e) => setPullModel(e.target.value)}
              placeholder="e.g. qwen2.5:7b-instruct"
              disabled={pulling}
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handlePull}
              disabled={pulling || !pullModel.trim()}
              className="h-9 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {pulling ? 'Pulling…' : 'Pull'}
            </button>
          </div>
          {pulling && pullProgress && (
            <p className="text-xs text-muted-foreground animate-pulse">{pullProgress}</p>
          )}
        </div>
      )}
    </section>
  )
}

function CvsSection() {
  const queryClient = useQueryClient()
  const cvsQuery = trpc.cvs.list.useQuery()
  const cvs = cvsQuery.data ?? []

  const uploadCv = trpc.cvs.upload.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const setDefault = trpc.cvs.setDefault.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const deleteCv = trpc.cvs.delete.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">CVs</h2>
        <button
          type="button"
          onClick={() => uploadCv.mutate()}
          disabled={uploadCv.isLoading}
          className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {uploadCv.isLoading ? 'Uploading…' : '+ Upload CV'}
        </button>
      </div>

      {cvsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!cvsQuery.isLoading && cvs.length === 0 && (
        <p className="text-sm text-muted-foreground">No CVs uploaded yet.</p>
      )}

      {cvs.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Default</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Added</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cvs.map((cv) => (
                <tr key={cv.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium max-w-[240px]">
                    <span className="block truncate" title={cv.name}>{cv.name}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {cv.is_default ? (
                      <span className="text-amber-500 font-medium">★ Default</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDefault.mutate(cv.id)}
                        disabled={setDefault.isLoading}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Set default
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {new Date(cv.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${cv.name}"?`)) deleteCv.mutate(cv.id)
                      }}
                      disabled={deleteCv.isLoading}
                      className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function GmailSection() {
  const queryClient = useQueryClient()
  const connectedQuery = trpc.gmail.isConnected.useQuery()
  const settingsQuery = trpc.settings.getAll.useQuery()

  const connectMutation = trpc.gmail.connect.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const disconnectMutation = trpc.gmail.disconnect.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const isConnected = connectedQuery.data ?? false
  const intervalMinutes = settingsQuery.data?.scan_interval_minutes ?? '30'

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gmail</h2>

      <div className="flex items-center gap-3">
        <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
        <span className="text-sm">{isConnected ? 'Connected' : 'Not connected'}</span>
        {!isConnected ? (
          <button
            type="button"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isLoading}
            className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Connect Gmail
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (confirm('Disconnect Gmail? This will revoke the OAuth token.')) {
                disconnectMutation.mutate()
              }
            }}
            disabled={disconnectMutation.isLoading}
            className="h-8 inline-flex items-center justify-center rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      {!isConnected && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            You need a Google OAuth client ID and secret. Set them as environment variables
            <code className="mx-1 px-1 py-0.5 bg-muted rounded text-[11px]">GOOGLE_CLIENT_ID</code>
            and
            <code className="mx-1 px-1 py-0.5 bg-muted rounded text-[11px]">GOOGLE_CLIENT_SECRET</code>
            before launching, or store them in settings below.
          </p>
          <div className="space-y-2">
            {(['google_client_id', 'google_client_secret'] as const).map((key) => (
              <div key={key} className="flex gap-2">
                <input
                  type={key === 'google_client_secret' ? 'password' : 'text'}
                  placeholder={key === 'google_client_id' ? 'Google Client ID' : 'Google Client Secret'}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      setSetting.mutate({ key, value: e.target.value.trim() })
                    }
                  }}
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isConnected && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Scan interval (minutes)</label>
          <select
            value={intervalMinutes}
            onChange={(e) => setSetting.mutate({ key: 'scan_interval_minutes', value: e.target.value })}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {['10', '15', '30', '60', '120'].map((v) => (
              <option key={v} value={v}>{v} minutes</option>
            ))}
          </select>
        </div>
      )}
    </section>
  )
}

function PairingSection() {
  const queryClient = useQueryClient()
  const tokenQuery = trpc.settings.getPairingToken.useQuery()
  const rotateMutation = trpc.settings.rotatePairingToken.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const [copied, setCopied] = useState(false)

  const token = tokenQuery.data ?? ''

  function handleCopy() {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chrome extension pairing</h2>

      <p className="text-sm text-muted-foreground">
        Install the companion extension, then paste this token in the extension popup to pair it with the desktop app.
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Bearer token</label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={tokenQuery.isLoading ? '…' : token}
            className="flex-1 h-9 rounded-md border border-input bg-muted px-3 text-sm font-mono text-muted-foreground focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={!token}
            className={cn(
              'h-9 inline-flex items-center justify-center rounded-md border px-3 text-sm transition-colors',
              copied
                ? 'border-green-500 text-green-600 bg-green-50'
                : 'border-input hover:bg-accent'
            )}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Rotate the token? The extension will need to be re-paired.')) {
                rotateMutation.mutate()
              }
            }}
            disabled={rotateMutation.isLoading}
            className="h-9 inline-flex items-center justify-center rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50 transition-colors"
          >
            Rotate
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          The desktop app runs a local HTTP server on 127.0.0.1 for the extension to communicate with.
        </p>
      </div>
    </section>
  )
}

// ─── Statuses ─────────────────────────────────────────────────────────────────

function StatusesSection() {
  const queryClient = useQueryClient()
  const statusesQuery = trpc.statuses.list.useQuery()
  const statuses = statusesQuery.data ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#94a3b8')
  const [editTerminal, setEditTerminal] = useState(0)
  const [editDefault, setEditDefault] = useState(0)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#94a3b8')
  const [newTerminal, setNewTerminal] = useState(false)

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const createMutation = trpc.statuses.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries()
      setCreating(false)
      setNewName('')
      setNewColor('#94a3b8')
      setNewTerminal(false)
    },
  })

  const updateMutation = trpc.statuses.update.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries()
      setEditingId(null)
    },
  })

  const deleteMutation = trpc.statuses.delete.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (err) => setDeleteError(err.message),
  })

  const reorderMutation = trpc.statuses.reorder.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  function startEdit(s: typeof statuses[number]) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditColor(s.color)
    setEditTerminal(s.is_terminal)
    setEditDefault(s.is_default_new)
  }

  function moveStatus(id: string, direction: -1 | 1) {
    const idx = statuses.findIndex((s) => s.id === id)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= statuses.length) return
    const ids = statuses.map((s) => s.id)
    const tmp = ids[idx]
    ids[idx] = ids[newIdx]
    ids[newIdx] = tmp
    reorderMutation.mutate(ids)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Statuses</h2>

      {deleteError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {deleteError}{' '}
          <button type="button" className="underline" onClick={() => setDeleteError(null)}>Dismiss</button>
        </p>
      )}

      <div className="space-y-1.5">
        {statuses.map((s, idx) => (
          <div key={s.id} className="rounded-md border border-border bg-card">
            {editingId === s.id ? (
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0"
                  />
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editTerminal === 1}
                      onChange={(e) => setEditTerminal(e.target.checked ? 1 : 0)}
                    />
                    Terminal (end state)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDefault === 1}
                      onChange={(e) => setEditDefault(e.target.checked ? 1 : 0)}
                    />
                    Default for new applications
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({
                      id: s.id, name: editName, color: editColor,
                      is_terminal: editTerminal, is_default_new: editDefault,
                    })}
                    disabled={updateMutation.isLoading || !editName.trim()}
                    className="h-7 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="h-7 inline-flex items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-sm">{s.name}</span>
                {s.is_terminal === 1 && (
                  <span className="text-xs text-muted-foreground">terminal</span>
                )}
                {s.is_default_new === 1 && (
                  <span className="text-xs text-muted-foreground">default</span>
                )}
                <div className="flex items-center gap-1 ml-1">
                  <button
                    type="button"
                    onClick={() => moveStatus(s.id, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-0.5"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStatus(s.id, 1)}
                    disabled={idx === statuses.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-0.5"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null)
                      if (confirm(`Delete status "${s.name}"?`)) {
                        deleteMutation.mutate(s.id)
                      }
                    }}
                    className="text-xs text-destructive hover:text-destructive/80 underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0"
            />
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Status name"
              className="flex-1 h-8 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={newTerminal}
              onChange={(e) => setNewTerminal(e.target.checked)}
            />
            Terminal (end state)
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createMutation.mutate({ name: newName, color: newColor, is_terminal: newTerminal ? 1 : 0 })}
              disabled={createMutation.isLoading || !newName.trim()}
              className="h-7 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="h-7 inline-flex items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-sm text-primary hover:underline"
        >
          + Add status
        </button>
      )}
    </section>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  const queryClient = useQueryClient()
  const settingsQuery = trpc.settings.getAll.useQuery()
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const notifEnabled = settingsQuery.data?.notification_enabled !== '0'
  const followUpDays = settingsQuery.data?.follow_up_days ?? '7'

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notifications & Reminders</h2>
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={(e) =>
              setSetting.mutate({ key: 'notification_enabled', value: e.target.checked ? '1' : '0' })
            }
          />
          <span className="text-sm">Enable OS notifications</span>
        </label>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Follow-up reminder threshold (days)</label>
          <input
            type="number"
            min={1}
            max={60}
            defaultValue={followUpDays}
            onBlur={(e) => setSetting.mutate({ key: 'follow_up_days', value: e.target.value })}
            className="w-24 h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Applications with no activity for this many days will be flagged under "Needs follow-up".
          </p>
        </div>
      </div>
    </section>
  )
}

export function SettingsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <h1 className="text-base font-semibold">Settings</h1>
      </div>
      <div className="flex-1 px-6 py-6 space-y-10 max-w-2xl">
        <OllamaSection />
        <GmailSection />
        <CvsSection />
        <StatusesSection />
        <NotificationsSection />
        <PairingSection />
      </div>
    </div>
  )
}
