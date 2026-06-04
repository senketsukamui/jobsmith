import { useState } from 'react'
import type { ApplicationWithRelations, Status } from '@job-tracker/shared'
import { StatusSelect } from './StatusSelect'

type SortKey = 'company' | 'role' | 'source' | 'applied_at' | 'last_activity_at'

interface ApplicationTableProps {
  applications: ApplicationWithRelations[]
  statuses: Status[]
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

export function ApplicationTable({ applications, statuses }: ApplicationTableProps) {
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
        <p className="text-sm mt-1">Click "+ New application" to add your first one.</p>
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {(
              [
                ['company', 'Company'],
                ['role', 'Role'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
              >
                {label}
                <SortIndicator col={key} />
              </th>
            ))}
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th
              onClick={() => handleSort('source')}
              className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
            >
              Source
              <SortIndicator col="source" />
            </th>
            {(
              [
                ['applied_at', 'Applied'],
                ['last_activity_at', 'Last activity'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
              >
                {label}
                <SortIndicator col={key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((app) => (
            <tr key={app.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-medium">{app.company.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{app.role_title}</td>
              <td className="px-4 py-3">
                <StatusSelect
                  applicationId={app.id}
                  currentStatus={app.status}
                  statuses={statuses}
                />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {SOURCE_LABELS[app.source] ?? app.source}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(app.applied_at)}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(app.last_activity_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
