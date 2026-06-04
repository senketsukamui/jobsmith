import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApplicationSource } from '@job-tracker/shared'
import { trpc } from '@/lib/trpc'
import { useUiStore } from '@/stores/ui'

const SOURCES: { value: ApplicationSource; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'lever', label: 'Lever' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'other', label: 'Other' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function AddApplicationDialog() {
  const { isAddDialogOpen, closeAddDialog } = useUiStore()
  const queryClient = useQueryClient()

  const [companyName, setCompanyName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [source, setSource] = useState<ApplicationSource>('manual')
  const [appliedAt, setAppliedAt] = useState(todayISO())
  const [error, setError] = useState('')

  // Company autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false)
  const companySearch = trpc.companies.list.useQuery(companyName, {
    enabled: companyName.length > 0,
    keepPreviousData: true,
  })

  const createApp = trpc.applications.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries()
      handleClose()
    },
    onError: (err: { message: string }) => setError(err.message),
  })

  function handleClose() {
    setCompanyName('')
    setCompanyWebsite('')
    setRoleTitle('')
    setJobDescription('')
    setJobUrl('')
    setSource('manual')
    setAppliedAt(todayISO())
    setError('')
    setShowSuggestions(false)
    closeAddDialog()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    if (!roleTitle.trim()) {
      setError('Role title is required')
      return
    }
    setError('')
    createApp.mutate({
      company: {
        name: companyName.trim(),
        website: companyWebsite.trim() || undefined,
      },
      role_title: roleTitle.trim(),
      job_description: jobDescription.trim() || undefined,
      job_url: jobUrl.trim() || undefined,
      source,
      applied_at: appliedAt ? new Date(appliedAt).getTime() : undefined,
    })
  }

  if (!isAddDialogOpen) return null

  const suggestions = companySearch.data?.map((c: { name: string }) => c.name) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-background rounded-xl shadow-2xl border border-border mx-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">New application</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-4">
            {/* Company */}
            <div className="space-y-1.5 relative">
              <label className="text-sm font-medium">Company *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value)
                  setShowSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Stripe"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoFocus
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-border bg-popover shadow-md max-h-40 overflow-y-auto">
                  {(suggestions as string[]).map((name: string) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={() => {
                        setCompanyName(name)
                        setShowSuggestions(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Company website */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Company website</label>
              <input
                type="url"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://stripe.com"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role title *</label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Senior Frontend Engineer"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Job URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job URL</label>
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://stripe.com/jobs/..."
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Source + Applied date row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as ApplicationSource)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Applied date</label>
                <input
                  type="date"
                  value={appliedAt}
                  onChange={(e) => setAppliedAt(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            {/* Job description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job description</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={5}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createApp.isLoading}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createApp.isLoading ? 'Saving…' : 'Save application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
