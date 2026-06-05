import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useUiStore } from '@/stores/ui'
import { ApplicationTable } from '@/components/ApplicationTable'
import { KanbanBoard } from '@/components/KanbanBoard'
import { AddApplicationDialog } from '@/components/AddApplicationDialog'
import { ApplicationDetailPanel } from '@/components/ApplicationDetailPanel'

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="1" y1="5" x2="13" y2="5" />
      <line x1="1" y1="9" x2="13" y2="9" />
      <line x1="5" y1="5" x2="5" y2="13" />
    </svg>
  )
}

function KanbanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="3" height="12" rx="1" />
      <rect x="5.5" y="1" width="3" height="8" rx="1" />
      <rect x="10" y="1" width="3" height="10" rx="1" />
    </svg>
  )
}

export function ApplicationsPage() {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const {
    statusFilter,
    sourceFilter,
    searchQuery,
    showArchived,
    viewMode,
    openAddDialog,
    setStatusFilter,
    setSourceFilter,
    setSearchQuery,
    setShowArchived,
    setViewMode,
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

  const isLoading = showFollowUp ? staleQuery.isLoading : applicationsQuery.isLoading
  const isError = showFollowUp ? staleQuery.isError : applicationsQuery.isError
  const errorMessage = showFollowUp
    ? staleQuery.error?.message
    : applicationsQuery.error?.message

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* ── Left: toolbar + view ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Primary bar: title · search · view toggle · add */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 shrink-0">
          <h1 className="text-base font-semibold shrink-0">Applications</h1>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company or role…"
            className="min-w-0 flex-1 h-8 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <div className="flex items-center rounded-md border border-input shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center w-8 h-8 rounded-l-md transition-colors ${
                viewMode === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Table view"
            >
              <TableIcon />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center justify-center w-8 h-8 rounded-r-md border-l border-input transition-colors ${
                viewMode === 'kanban' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Kanban view"
            >
              <KanbanIcon />
            </button>
          </div>

          <button
            type="button"
            onClick={openAddDialog}
            className="shrink-0 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New
          </button>
        </div>

        {/* Filter bar: status chips · source · follow-up · archived */}
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

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-24 text-destructive text-sm">
              Error: {errorMessage}
            </div>
          ) : viewMode === 'kanban' ? (
            <KanbanBoard
              applications={applications}
              statuses={statuses}
              selectedId={selectedAppId}
              onCardClick={(id) => setSelectedAppId(id === selectedAppId ? null : id)}
            />
          ) : (
            <div className="overflow-auto h-full px-4 py-3">
              <ApplicationTable
                applications={applications}
                statuses={statuses}
                selectedId={selectedAppId}
                onRowClick={(id) => setSelectedAppId(id === selectedAppId ? null : id)}
              />
            </div>
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
