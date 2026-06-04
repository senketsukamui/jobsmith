import { useState } from 'react'
import type { ApplicationWithRelations, Status } from '@job-tracker/shared'
import { StatusSelect } from './StatusSelect'

type SortKey = 'company' | 'role' | 'source' | 'applied_at' | 'last_activity_at'

interface ApplicationTableProps {
  applications: ApplicationWithRelations[]
  statuses: Status[]
  selectedId?: string | null
  onRowClick?: (id: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  lever: 'Lever',
  greenhouse: 'Greenhouse',
  manual: 'Manual',
  other: 'Other',
}

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ApplicationTable({ applications, statuses, selectedId, onRowClick }: ApplicationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('last_activity_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...applications].sort((a, b) => {
    let av: string | number | null = null
    let bv: string | number | null = null

    if (sortKey === 'company') {
      av = a.company.name.toLowerCase()
      bv = b.company.name.toLowerCase()
    } else if (sortKey === 'role') {
      av = a.role_title.toLowerCase()
      bv = b.role_title.toLowerCase()
    } else if (sortKey === 'source') {
      av = a.source
      bv = b.source
    } else if (sortKey === 'applied_at') {
      av = a.applied_at ?? 0
      bv = b.applied_at ?? 0
    } else if (sortKey === 'last_activity_at') {
      av = a.last_activity_at ?? 0
      bv = b.last_activity_at ?? 0
    }

    if (av === null) return 1
    if (bv === null) return -1
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-muted-foreground opacity-40">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">No applications yet</p>
        <p className="text-sm mt-1">Click "+ New" to add your first one.</p>
      </div>
    )
  }

  const thBase = 'px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap'
  const thStatic = 'px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap'

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[580px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th onClick={() => handleSort('company')} className={thBase}>
              Company <SortIndicator col="company" />
            </th>
            <th onClick={() => handleSort('role')} className={thBase}>
              Role <SortIndicator col="role" />
            </th>
            <th className={thStatic}>Status</th>
            <th onClick={() => handleSort('source')} className={thBase}>
              Source <SortIndicator col="source" />
            </th>
            <th onClick={() => handleSort('applied_at')} className={thBase}>
              Applied <SortIndicator col="applied_at" />
            </th>
            <th onClick={() => handleSort('last_activity_at')} className={thBase}>
              Last activity <SortIndicator col="last_activity_at" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((app) => (
            <tr
              key={app.id}
              onClick={() => onRowClick?.(app.id)}
              className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selectedId === app.id ? 'bg-accent' : 'hover:bg-muted/30'}`}
            >
              <td className="px-3 py-2.5 font-medium max-w-[180px]">
                <span className="block truncate" title={app.company.name}>
                  {app.company.name}
                </span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground max-w-[220px]">
                <span className="block truncate" title={app.role_title}>
                  {app.role_title}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <StatusSelect
                  applicationId={app.id}
                  currentStatus={app.status}
                  statuses={statuses}
                />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                {SOURCE_LABELS[app.source] ?? app.source}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                {formatDate(app.applied_at)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                {formatDate(app.last_activity_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
