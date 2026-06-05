import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { Status } from '@job-tracker/shared'
import { CoverLetterModal } from './CoverLetterModal'

interface ApplicationDetailPanelProps {
  applicationId: string
  statuses: Status[]
  onClose: () => void
}

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  lever: 'Lever',
  greenhouse: 'Greenhouse',
  manual: 'Manual',
  other: 'Other',
}

function PageClippingSection({ markdown }: { markdown: string }) {
  const [expanded, setExpanded] = useState(false)
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Page clipping
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{wordCount.toLocaleString()} words</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(markdown)}
            className="text-xs text-primary hover:underline"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 rounded-md p-2 max-h-64 overflow-y-auto">
          {markdown}
        </pre>
      )}
    </div>
  )
}

export function ApplicationDetailPanel({ applicationId, statuses, onClose }: ApplicationDetailPanelProps) {
  const queryClient = useQueryClient()
  const appQuery = trpc.applications.get.useQuery(applicationId)
  const coverLettersQuery = trpc.coverLetters.list.useQuery(applicationId)
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  const deleteCoverLetter = trpc.coverLetters.delete.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const app = appQuery.data
  const coverLetters = coverLettersQuery.data ?? []

  if (appQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Application not found.
      </div>
    )
  }

  const status = statuses.find((s) => s.id === app.current_status_id)
  const cvId = app.cv_id ?? null

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border shrink-0 gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{app.company?.name ?? ''}</p>
            <h2 className="text-sm font-semibold leading-tight truncate">{app.role_title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground leading-none text-base"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 text-sm">

          {/* Status + metadata */}
          <div className="space-y-2">
            {status && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Status</span>
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: status.color }}
                >
                  {status.name}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Source</span>
              <span className="text-xs">{SOURCE_LABELS[app.source] ?? app.source}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Applied</span>
              <span className="text-xs">{formatDate(app.applied_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Activity</span>
              <span className="text-xs">{formatDate(app.last_activity_at)}</span>
            </div>
            {app.job_url && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Job URL</span>
                <a
                  href={app.job_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline truncate"
                >
                  {app.job_url}
                </a>
              </div>
            )}
          </div>

          {/* Job description */}
          {app.job_description && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job description</p>
              <div className={`text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap ${!descExpanded ? 'line-clamp-6' : ''}`}>
                {app.job_description}
              </div>
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}

          {/* Page clipping */}
          {app.page_markdown && (
            <PageClippingSection markdown={app.page_markdown} />
          )}

          {/* Cover letters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cover letters</p>
              <button
                type="button"
                onClick={() => setShowCoverLetterModal(true)}
                className="h-7 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Generate
              </button>
            </div>

            {coverLettersQuery.isLoading && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}

            {!coverLettersQuery.isLoading && coverLetters.length === 0 && (
              <p className="text-xs text-muted-foreground">No cover letters yet.</p>
            )}

            {coverLetters.map((cl) => (
              <div key={cl.id} className="rounded-md border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(cl.created_at).toLocaleString()}
                    {cl.is_edited ? ' · edited' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this cover letter?')) deleteCoverLetter.mutate(cl.id)
                    }}
                    className="text-xs text-destructive hover:text-destructive/80"
                  >
                    Delete
                  </button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">
                  {cl.generated_content}
                </p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(cl.generated_content)}
                  className="text-xs text-primary hover:underline"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showCoverLetterModal && (
        <CoverLetterModal
          applicationId={applicationId}
          initialCvId={cvId}
          onClose={() => {
            setShowCoverLetterModal(false)
            queryClient.invalidateQueries()
          }}
        />
      )}
    </>
  )
}
