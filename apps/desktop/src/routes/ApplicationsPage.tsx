import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useUiStore } from '@/stores/ui'
import { ApplicationTable } from '@/components/ApplicationTable'
import { AddApplicationDialog } from '@/components/AddApplicationDialog'
import { ApplicationDetailPanel } from '@/components/ApplicationDetailPanel'

export function ApplicationsPage() {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const {
    statusFilter,
    sourceFilter,
    searchQuery,
    showArchived,
    openAddDialog,
    setStatusFilter,
    setSourceFilter,
    setSearchQuery,
    setShowArchived,
  } = useUiStore()
  const [showFollowUp, setShowFollowUp] = useState(false)

  const statusesQuery = trpc.statuses.list.useQuery()
  const applicationsQuery = trpc.applications.list.useQuery(
    {
      status_ids: statusFilter.length > 0 ? statusFilter : undefined,
      source: (sourceFilter as never) || undefined,
      query: searchQuery || undefined,
      archived: showArchived,
    },
    { enabled: !showFollowUp }
  )
  const staleQuery = trpc.applications.stale.useQuery(7, { enabled: showFollowUp })

  const statuses = statusesQuery.data ?? []
  const applications = showFollowUp
    ? (staleQuery.data ?? [])
    : (applicationsQuery.data ?? [])

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* ── Left: toolbar + table ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Primary bar: title · search · add */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 shrink-0">
          <h1 className="text-base font-semibold shrink-0">Applications</h1>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company or role…"
            className="min-w-0 flex-1 h-8 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <button
            type="button"
            onClick={openAddDialog}
            className="shrink-0 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New
          </button>
        </div>

        {/* Filter bar: status chips · source · archived */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          {statuses.map((s) => {
            const active = statusFilter.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setStatusFilter(
                    active
                      ? statusFilter.filter((id) => id !== s.id)
                      : [...statusFilter, s.id]
                  )
                }
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all whitespace-nowrap"
                style={
                  active
                    ? { backgroundColor: s.color, color: '#fff', borderColor: s.color }
                    : { borderColor: s.color, color: s.color }
                }
              >
                {s.name}
              </button>
            )
          })}

          {statusFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter([])}
              className="text-xs text-muted-foreground hover:text-foreground underline whitespace-nowrap"
            >
              Clear
            </button>
          )}

          <div className="flex-1" />

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All sources</option>
            <option value="linkedin">LinkedIn</option>
            <option value="lever">Lever</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="manual">Manual</option>
            <option value="other">Other</option>
          </select>

          <button
            type="button"
            onClick={() => setShowFollowUp(!showFollowUp)}
            className={`text-xs px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap ${
              showFollowUp
                ? 'bg-amber-500 text-white border-amber-500'
                : 'border-amber-500 text-amber-600 hover:bg-amber-50'
            }`}
          >
            Needs follow-up
          </button>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Archived
          </label>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {applicationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : applicationsQuery.isError ? (
            <div className="flex items-center justify-center py-24 text-destructive text-sm">
              Error: {applicationsQuery.error.message}
            </div>
          ) : (
            <ApplicationTable
              applications={applications}
              statuses={statuses}
              selectedId={selectedAppId}
              onRowClick={(id) => setSelectedAppId(id === selectedAppId ? null : id)}
            />
          )}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {selectedAppId && (
        <div className="w-72 shrink-0 h-full overflow-hidden">
          <ApplicationDetailPanel
            applicationId={selectedAppId}
            statuses={statuses}
            onClose={() => setSelectedAppId(null)}
          />
        </div>
      )}

      <AddApplicationDialog />
    </div>
  )
}
