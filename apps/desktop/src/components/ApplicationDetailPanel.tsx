import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import type { Status } from '@jobsmith/shared'
import { CoverLetterModal } from './CoverLetterModal'
import { useToast } from './Toast'

interface ApplicationDetailPanelProps {
  applicationId: string
  statuses: Status[]
  onClose: () => void
}

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function tsToDateInput(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts).toISOString().split('T')[0]
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
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Page clipping</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{wordCount.toLocaleString()} words</span>
          <button type="button" onClick={() => navigator.clipboard.writeText(markdown)} className="text-xs text-primary hover:underline">Copy</button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">{expanded ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      {expanded && (
        <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 rounded-md p-2 max-h-64 overflow-y-auto">{markdown}</pre>
      )}
    </div>
  )
}

function ParseReviewModal({ applicationId, parsed, onClose }: {
  applicationId: string
  parsed: { company_name: string; role_title: string; job_description: string }
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [role, setRole] = useState(parsed.role_title)
  const [desc, setDesc] = useState(parsed.job_description)
  const [error, setError] = useState<string | null>(null)

  const updateMutation = trpc.applications.update.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); toast('Application updated', 'success'); onClose() },
    onError: (err) => setError(err.message ?? 'Save failed'),
  })

  function handleSave() {
    setError(null)
    updateMutation.mutate({
      id: applicationId,
      role_title: role.trim() || undefined,
      job_description: desc || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg p-6 space-y-4 mx-4">
        <div>
          <h2 className="text-sm font-semibold">AI extracted fields</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Review and edit before saving.</p>
        </div>
        {parsed.company_name && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company (read-only)</label>
            <p className="text-sm px-3 py-2 rounded-md bg-muted/40 text-muted-foreground">{parsed.company_name}</p>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role title</label>
          <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={8} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="h-8 inline-flex items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent">Discard</button>
          <button type="button" onClick={handleSave} disabled={updateMutation.isLoading} className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {updateMutation.isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ApplicationDetailPanel({ applicationId, statuses, onClose }: ApplicationDetailPanelProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const appQuery = trpc.applications.get.useQuery(applicationId)
  const coverLettersQuery = trpc.coverLetters.list.useQuery(applicationId)

  const [editing, setEditing] = useState(false)
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [parseResult, setParseResult] = useState<{ company_name: string; role_title: string; job_description: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const [editRole, setEditRole] = useState('')
  const [editSource, setEditSource] = useState('')
  const [editAppliedAt, setEditAppliedAt] = useState('')
  const [editJobUrl, setEditJobUrl] = useState('')
  const [editJobDesc, setEditJobDesc] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const deleteCoverLetter = trpc.coverLetters.delete.useMutation({ onSuccess: () => queryClient.invalidateQueries() })
  const archiveMutation = trpc.applications.archive.useMutation({ onSuccess: () => queryClient.invalidateQueries() })

  const updateMutation = trpc.applications.update.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); setEditing(false); toast('Application updated', 'success') },
  })

  const deleteMutation = trpc.applications.delete.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); toast('Application deleted', 'default'); onClose() },
  })

  const parseMutation = trpc.applications.parseMarkdown.useMutation({
    onSuccess: (data) => { setParseError(null); setParseResult(data) },
    onError: (err) => setParseError(err.message),
  })

  const app = appQuery.data
  const coverLetters = coverLettersQuery.data ?? []

  if (appQuery.isLoading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
  if (!app) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Application not found.</div>

  const status = statuses.find((s) => s.id === app.current_status_id)
  const cvId = app.cv_id ?? null

  function startEditing() {
    setEditRole(app!.role_title)
    setEditSource(app!.source)
    setEditAppliedAt(tsToDateInput(app!.applied_at))
    setEditJobUrl(app!.job_url ?? '')
    setEditJobDesc(app!.job_description ?? '')
    setEditNotes(app!.notes ?? '')
    setEditing(true)
  }

  function handleSaveEdit() {
    updateMutation.mutate({
      id: app!.id,
      role_title: editRole || undefined,
      source: (editSource as never) || undefined,
      applied_at: editAppliedAt ? new Date(editAppliedAt).getTime() : undefined,
      job_url: editJobUrl || undefined,
      job_description: editJobDesc || undefined,
      notes: editNotes || undefined,
    })
  }

  function handleDelete() {
    if (!confirm(`Delete "${app!.role_title}" at ${app!.company?.name ?? 'this company'}? This cannot be undone.`)) return
    deleteMutation.mutate(app!.id)
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border shrink-0 gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{app.company?.name ?? ''}</p>
            <h2 className="text-sm font-semibold leading-tight truncate">{app.role_title}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <button type="button" onClick={startEditing} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
            )}
            <button type="button" onClick={() => archiveMutation.mutate({ id: app.id, archived: app.archived ? 0 : 1 })} disabled={archiveMutation.isLoading} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
              {app.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button type="button" onClick={handleDelete} disabled={deleteMutation.isLoading} className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50">Delete</button>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground leading-none text-base">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 text-sm">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role title</label>
                <input type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
                <select value={editSource} onChange={(e) => setEditSource(e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="linkedin">LinkedIn</option>
                  <option value="lever">Lever</option>
                  <option value="greenhouse">Greenhouse</option>
                  <option value="manual">Manual</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Applied date</label>
                <input type="date" value={editAppliedAt} onChange={(e) => setEditAppliedAt(e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job URL</label>
                <input type="url" value={editJobUrl} onChange={(e) => setEditJobUrl(e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job description</label>
                <textarea value={editJobDesc} onChange={(e) => setEditJobDesc(e.target.value)} rows={5} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} placeholder="Personal notes, follow-up reminders, interview prep…" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleSaveEdit} disabled={updateMutation.isLoading} className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {updateMutation.isLoading ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="h-8 inline-flex items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {/* Read-only metadata */}
              <div className="space-y-2">
                {status && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">Status</span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: status.color }}>{status.name}</span>
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
                    <a href={app.job_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">{app.job_url}</a>
                  </div>
                )}
              </div>

              {/* Notes */}
              {app.notes && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                  <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{app.notes}</p>
                </div>
              )}

              {/* Job description */}
              {app.job_description && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job description</p>
                  <div className={`text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap ${!descExpanded ? 'line-clamp-6' : ''}`}>{app.job_description}</div>
                  <button type="button" onClick={() => setDescExpanded((v) => !v)} className="text-xs text-primary hover:underline">{descExpanded ? 'Show less' : 'Show more'}</button>
                </div>
              )}

              {/* Page clipping */}
              {app.page_markdown && (
                <div className="space-y-2">
                  <PageClippingSection markdown={app.page_markdown} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setParseError(null); parseMutation.mutate(app.id) }} disabled={parseMutation.isLoading} className="h-7 inline-flex items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent disabled:opacity-50 transition-colors">
                      {parseMutation.isLoading ? 'Parsing…' : 'Parse with AI'}
                    </button>
                    {parseError && <span className="text-xs text-destructive">{parseError}</span>}
                  </div>
                </div>
              )}

              {/* Cover letters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cover letters</p>
                  <button type="button" onClick={() => setShowCoverLetterModal(true)} className="h-7 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Generate</button>
                </div>
                {coverLettersQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                {!coverLettersQuery.isLoading && coverLetters.length === 0 && <p className="text-xs text-muted-foreground">No cover letters yet.</p>}
                {coverLetters.map((cl) => (
                  <div key={cl.id} className="rounded-md border border-border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(cl.created_at).toLocaleString()}{cl.is_edited ? ' · edited' : ''}</span>
                      <button type="button" onClick={() => { if (confirm('Delete this cover letter?')) deleteCoverLetter.mutate(cl.id) }} className="text-xs text-destructive hover:text-destructive/80">Delete</button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">{cl.generated_content}</p>
                    <button type="button" onClick={() => navigator.clipboard.writeText(cl.generated_content)} className="text-xs text-primary hover:underline">Copy</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showCoverLetterModal && (
        <CoverLetterModal applicationId={applicationId} initialCvId={cvId} onClose={() => { setShowCoverLetterModal(false); queryClient.invalidateQueries() }} />
      )}
      {parseResult && (
        <ParseReviewModal applicationId={applicationId} parsed={parseResult} onClose={() => setParseResult(null)} />
      )}
    </>
  )
}
