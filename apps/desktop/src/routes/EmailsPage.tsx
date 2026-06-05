import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { Email } from '@job-tracker/shared'

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
          {email.body_snippet}
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
        {!linkedApp && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">No matched application</span>
            <button
              type="button"
              onClick={() => setShowLink((v) => !v)}
              className="text-primary hover:underline"
            >
              Link manually
            </button>
          </div>
        )}
      </div>

      {/* Link picker */}
      {showLink && (
        <div className="flex gap-2">
          <select
            value={linkAppId}
            onChange={(e) => setLinkAppId(e.target.value)}
            className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select application…</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company.name} — {a.role_title}
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
            Link
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
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
      </div>
    </div>
  )
}

export function EmailsPage() {
  const queryClient = useQueryClient()
  const pendingQuery = trpc.emails.pending.useQuery()
  const statusesQuery = trpc.statuses.list.useQuery()
  const scanMutation = trpc.emails.scanNow.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const pending = pendingQuery.data ?? []
  const statuses = statusesQuery.data ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold">Email suggestions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pending.length > 0
              ? `${pending.length} pending ${pending.length === 1 ? 'suggestion' : 'suggestions'}`
              : 'No pending suggestions'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isLoading}
          className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isLoading ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {/* Scan result */}
      {scanMutation.isSuccess && (
        <div className="px-6 py-2 text-xs text-muted-foreground border-b border-border shrink-0">
          Scan complete — {(scanMutation.data as { scanned: number; newMatches: number }).scanned} messages checked,{' '}
          {(scanMutation.data as { scanned: number; newMatches: number }).newMatches} new matches
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {pendingQuery.isLoading ? (
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
        )}
      </div>
    </div>
  )
}
