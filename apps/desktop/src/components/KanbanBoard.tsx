import type { ApplicationWithRelations, Status } from '@jobsmith/shared'

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface KanbanCardProps {
  app: ApplicationWithRelations
  selected: boolean
  onClick: () => void
}

function KanbanCard({ app, selected, onClick }: KanbanCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 space-y-1.5 transition-all hover:shadow-sm ${
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-border/80'
      }`}
    >
      <p className="text-xs text-muted-foreground truncate">{app.company?.name ?? ''}</p>
      <p className="text-xs font-medium leading-snug line-clamp-2">{app.role_title}</p>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-muted-foreground">{formatDate(app.applied_at)}</span>
        {app.archived === 1 && (
          <span className="text-[10px] text-muted-foreground italic">archived</span>
        )}
      </div>
    </button>
  )
}

interface KanbanBoardProps {
  applications: ApplicationWithRelations[]
  statuses: Status[]
  selectedId: string | null
  onCardClick: (id: string) => void
}

export function KanbanBoard({ applications, statuses, selectedId, onCardClick }: KanbanBoardProps) {
  return (
    <div className="flex gap-3 h-full overflow-x-auto px-4 py-3 items-start">
      {statuses.map((status) => {
        const cards = applications.filter((a) => a.current_status_id === status.id)
        return (
          <div key={status.id} className="flex flex-col shrink-0 w-56 h-full">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: status.color }}
              />
              <span className="text-xs font-medium truncate">{status.name}</span>
              <span className="text-xs text-muted-foreground ml-auto shrink-0">{cards.length}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pb-2">
              {cards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-3 text-center">
                  <span className="text-xs text-muted-foreground">Empty</span>
                </div>
              ) : (
                cards.map((app) => (
                  <KanbanCard
                    key={app.id}
                    app={app}
                    selected={selectedId === app.id}
                    onClick={() => onCardClick(app.id)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
