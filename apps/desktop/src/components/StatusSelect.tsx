import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Status } from '@job-tracker/shared'
import { trpc } from '@/lib/trpc'
import { StatusBadge } from './StatusBadge'

interface StatusSelectProps {
  applicationId: string
  currentStatus: Status
  statuses: Status[]
}

export function StatusSelect({ applicationId, currentStatus, statuses }: StatusSelectProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const changeStatus = trpc.applications.changeStatus.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries()
      setOpen(false)
    },
  })

  if (!open) {
    return <StatusBadge status={currentStatus} onClick={() => setOpen(true)} />
  }

  return (
    <div className="relative inline-block">
      <StatusBadge status={currentStatus} onClick={() => setOpen(false)} />
      <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-border bg-popover shadow-md">
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={changeStatus.isLoading}
            onClick={() =>
              changeStatus.mutate({ id: applicationId, status_id: s.id })
            }
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
            {s.id === currentStatus.id && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </button>
        ))}
      </div>
      {/* backdrop to close on outside click */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setOpen(false)}
      />
    </div>
  )
}
