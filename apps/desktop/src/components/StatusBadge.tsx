import type { Status } from '@job-tracker/shared'

interface StatusBadgeProps {
  status: Status
  onClick?: () => void
}

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: status.color }}
    >
      {status.name}
    </button>
  )
}
