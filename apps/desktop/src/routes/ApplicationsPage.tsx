import { trpc } from '@/lib/trpc'
import { useUiStore } from '@/stores/ui'
import { ApplicationTable } from '@/components/ApplicationTable'
import { AddApplicationDialog } from '@/components/AddApplicationDialog'

export function ApplicationsPage() {
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

  const statusesQuery = trpc.statuses.list.useQuery()
  const applicationsQuery = trpc.applications.list.useQuery({
    status_ids: statusFilter.length > 0 ? statusFilter : undefined,
    source: (sourceFilter as never) || undefined,
    query: searchQuery || undefined,
    archived: showArchived,
  })

  const statuses = statusesQuery.data ?? []
  const applications = applicationsQuery.data ?? []

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* ── Primary bar: title · search · add ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
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

      {/* ── Filter bar: status chips · source · archived ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
        {/* Status chips */}
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

        {/* Separator */}
        <div className="flex-1" />

        {/* Source dropdown */}
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

        {/* Archived toggle */}
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

      {/* ── Table ── */}
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
          <ApplicationTable applications={applications} statuses={statuses} />
        )}
      </div>

      <AddApplicationDialog />
    </div>
  )
}
