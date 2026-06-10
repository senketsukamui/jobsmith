import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { Email } from '@jobsmith/shared'
import { useToast } from '@/components/Toast'

function decodeHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.documentElement.textContent ?? html
  } catch {
    return html
  }
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  acknowledgment: 'Acknowledgment',
  rejection: 'Rejection',
  interview_invite: 'Interview invite',
  offer: 'Offer',
  follow_up_request: 'Follow-up',
  unrelated: 'Unrelated',
  unclear: 'Unclear',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  acknowledgment: '#60a5fa',
  rejection: '#ef4444',
  interview_invite: '#a78bfa',
  offer: '#22c55e',
  follow_up_request: '#f59e0b',
  unrelated: '#9ca3af',
  unclear: '#9ca3af',
}

function EmailCard({ email, statuses, onDone }: {
  email: Email
  statuses: { id: string; name: string; color: string }[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [linkAppId, setLinkAppId] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const draftMutation = trpc.emails.draftReply.useMutation({
    onSuccess: (text) => setDraft(text),
  })

  const applicationsQuery = trpc.applications.list.useQuery({})
  const apps = applicationsQuery.data ?? []

  const accept = trpc.emails.accept.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); onDone() },
  })
  const dismiss = trpc.emails.dismiss.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); onDone() },
  })
  const link = trpc.emails.linkToApplication.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const suggestedStatus = statuses.find((s) => s.id === email.suggested_status_id)
  const linkedApp = apps.find((a) => a.id === email.linked_application_id)
  const classLabel = email.classification ? CLASSIFICATION_LABELS[email.classification] : '—'
  const classColor = email.classification ? CLASSIFICATION_COLORS[email.classification] : '#9ca3af'

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{email.subject ?? '(no subject)'}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            From: {email.from_name ? `${email.from_name} <${email.from_address}>` : (email.from_address ?? '—')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: classColor }}
          >
            {classLabel}
          </span>
          {email.confidence != null && (
            <span className="text-xs text-muted-foreground">
              {Math.round(email.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Snippet */}
      {email.body_snippet && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {decodeHtml(email.body_snippet)}
        </p>
      )}

      {/* Suggested status + linked app */}
      <div className="flex flex-wrap gap-3 text-xs">
        {suggestedStatus && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Suggested status:</span>
            <span
              className="px-1.5 py-0.5 rounded-full text-white text-[11px] font-medium"
              style={{ backgroundColor: suggestedStatus.color }}
            >
              {suggestedStatus.name}
            </span>
          </div>
        )}
        {linkedApp && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Application:</span>
            <span className="font-medium">{linkedApp.company.name} — {linkedApp.role_title}</span>
          </div>
        )}
        {!linkedApp && !showLink && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">No matched application</span>
            <button
              type="button"
              onClick={() => setShowLink(true)}
              className="text-primary hover:underline"
            >
              Link manually
            </button>
          </div>
        )}
      </div>

      {/* Link picker */}
      {!linkedApp && showLink && (
        <div className="flex gap-2 items-center">
          <select
            value={linkAppId}
            onChange={(e) => setLinkAppId(e.target.value)}
            className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select application…</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company.name} — {a.role_title} @ {a.company.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!linkAppId || link.isLoading}
            onClick={() => {
              link.mutate({ emailId: email.id, applicationId: linkAppId })
              setShowLink(false)
            }}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {link.isLoading ? '…' : 'Link'}
          </button>
          <button
            type="button"
            onClick={() => { setShowLink(false); setLinkAppId('') }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => accept.mutate(email.id)}
          disabled={accept.isLoading || !email.linked_application_id || !email.suggested_status_id}
          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          title={!email.linked_application_id ? 'Link to an application first' : !email.suggested_status_id ? 'No status suggestion' : ''}
        >
          {accept.isLoading ? 'Applying…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => dismiss.mutate(email.id)}
          disabled={dismiss.isLoading}
          className="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
        >
          Dismiss
        </button>
        {email.classification === 'interview_invite' && (
          <button
            type="button"
            onClick={() => draftMutation.mutate(email.id)}
            disabled={draftMutation.isLoading}
            className="h-8 px-3 rounded-md border border-violet-300 text-violet-700 dark:text-violet-400 text-xs font-medium hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 transition-colors"
          >
            {draftMutation.isLoading ? 'Drafting…' : 'Draft reply'}
          </button>
        )}
      </div>

      {/* Draft reply area */}
      {draft !== null && (
        <div className="space-y-2 pt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(draft)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Hide
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryCard({ email, statuses, apps }: {
  email: Email
  statuses: { id: string; name: string; color: string }[]
  apps: { id: string; company: { name: string }; role_title: string }[]
}) {
  const classLabel = email.classification ? CLASSIFICATION_LABELS[email.classification] : '—'
  const classColor = email.classification ? CLASSIFICATION_COLORS[email.classification] : '#9ca3af'
  const suggestedStatus = statuses.find((s) => s.id === email.suggested_status_id)
  const linkedApp = apps.find((a) => a.id === email.linked_application_id)
  const isAutoApplied = email.user_action === 'accepted'

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2.5 opacity-90">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{email.subject ?? '(no subject)'}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            From: {email.from_name ? `${email.from_name} <${email.from_address}>` : (email.from_address ?? '—')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: classColor }}
          >
            {classLabel}
          </span>
          {email.confidence != null && (
            <span className="text-xs text-muted-foreground">
              {Math.round(email.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {linkedApp && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Application:</span>
            <span className="font-medium">{linkedApp.company.name} — {linkedApp.role_title}</span>
          </div>
        )}
        {suggestedStatus && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Status:</span>
            <span
              className="px-1.5 py-0.5 rounded-full text-white text-[11px] font-medium"
              style={{ backgroundColor: suggestedStatus.color }}
            >
              {suggestedStatus.name}
            </span>
          </div>
        )}
        {isAutoApplied ? (
          <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-medium border border-green-200">
            Auto-applied
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground italic">Dismissed</span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {email.processed_at ? new Date(email.processed_at).toLocaleString() : ''}
        </span>
      </div>
    </div>
  )
}

export function EmailsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'review' | 'history'>('review')
  const [scanning, setScanning] = useState(false)

  const pendingQuery = trpc.emails.pending.useQuery()
  const historyQuery = trpc.emails.history.useQuery()
  const statusesQuery = trpc.statuses.list.useQuery()
  const applicationsQuery = trpc.applications.list.useQuery({})

  const scanMutation = trpc.emails.scanNow.useMutation({
    onSuccess: (data) => {
      queryClient.invalidateQueries()
      setScanning(false)
      const result = data as { scanned: number; newMatches: number; autoApplied: number }
      const parts: string[] = [`${result.scanned} messages checked`]
      if (result.autoApplied > 0)
        parts.push(`${result.autoApplied} status update${result.autoApplied > 1 ? 's' : ''} applied`)
      if (result.newMatches > 0)
        parts.push(`${result.newMatches} need${result.newMatches > 1 ? '' : 's'} review`)
      toast(parts.join(' · '), result.autoApplied > 0 || result.newMatches > 0 ? 'success' : 'default')
    },
    onError: (err) => {
      setScanning(false)
      toast(err.message ?? 'Scan failed', 'error')
    },
  })

  function handleScan() {
    setScanning(true)
    scanMutation.mutate()
  }

  const pending = pendingQuery.data ?? []
  const history = historyQuery.data ?? []
  const statuses = statusesQuery.data ?? []
  const apps = applicationsQuery.data ?? []

  const scanData = scanMutation.data as { scanned: number; newMatches: number; autoApplied: number } | undefined

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-base font-semibold">Emails</h1>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {scanning ? (
            <>
              <svg className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning…
            </>
          ) : 'Scan now'}
        </button>
      </div>

      {/* Scanning indicator */}
      {scanning && (
        <div className="flex items-center gap-2 px-6 py-2 border-b border-border shrink-0 bg-primary/5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          <span className="text-xs text-primary font-medium animate-pulse">Scanning inbox…</span>
        </div>
      )}

      {/* Scan result banner */}
      {scanMutation.isSuccess && scanData && (
        <div className="px-6 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
          Scan complete — {scanData.scanned} messages checked
          {scanData.autoApplied > 0 && ` · ${scanData.autoApplied} applied automatically`}
          {scanData.newMatches > 0 && ` · ${scanData.newMatches} need review`}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 px-6 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'review'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Needs review
          {pending.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] w-4 h-4">
              {pending.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === 'review' ? (
          pendingQuery.isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-lg font-medium">No pending suggestions</p>
              <p className="text-sm mt-1">Click "Scan now" to check for new email matches.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {pending.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  statuses={statuses}
                  onDone={() => queryClient.invalidateQueries()}
                />
              ))}
            </div>
          )
        ) : (
          historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-lg font-medium">No history yet</p>
              <p className="text-sm mt-1">Auto-applied and dismissed emails will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {history.map((email) => (
                <HistoryCard
                  key={email.id}
                  email={email}
                  statuses={statuses}
                  apps={apps}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
