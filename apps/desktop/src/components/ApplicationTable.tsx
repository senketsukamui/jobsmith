import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApplicationWithRelations, Status } from '@jobsmith/shared'
import { trpc } from '@/lib/trpc'
import { StatusSelect } from './StatusSelect'

type SortKey = 'company' | 'role' | 'source' | 'applied_at' | 'last_activity_at' | 'age'

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

function daysAgo(ts: number | null): number | null {
  if (!ts) return null
  return Math.floor((Date.now() - ts) / 86_400_000)
}

function AgeBadge({ days, isTerminal }: { days: number | null; isTerminal: boolean }) {
  if (days === null || isTerminal) return <span className="text-muted-foreground">—</span>
  if (days >= 21) return <span className="text-xs font-semibold text-red-600 dark:text-red-400">{days}d</span>
  if (days >= 14) return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{days}d</span>
  return <span className="text-xs text-muted-foreground">{days}d</span>
}

export function ApplicationTable({ applications, statuses, selectedId, onRowClick }: ApplicationTableProps) {
  const queryClient = useQueryClient()
  const [sortKey, setSortKey] = useState<SortKey>('last_activity_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)

  const archiveMutation = trpc.applications.archive.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

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
    } else if (sortKey === 'last_activity_at' || sortKey === 'age') {
      av = a.last_activity_at ?? 0
      bv = b.last_activity_at ?? 0
    }

    if (av === null) return 1
    if (bv === null) return -1
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const allChecked = sorted.length > 0 && sorted.every((a) => checkedIds.has(a.id))
  const someChecked = checkedIds.size > 0

  function toggleAll() {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(sorted.map((a) => a.id)))
    }
  }

  function toggleOne(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (sorted.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min((i ?? -1) + 1, sorted.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max((i ?? sorted.length) - 1, 0))
    } else if (e.key === 'Enter' && focusedIndex !== null) {
      e.preventDefault()
      onRowClick?.(sorted[focusedIndex].id)
    } else if (e.key === 'Escape') {
      setFocusedIndex(null)
    }
  }, [sorted, focusedIndex, onRowClick])

  async function handleBulkArchive() {
    if (!checkedIds.size) return
    setBulkLoading(true)
    const ids = Array.from(checkedIds)
    for (const id of ids) {
      await archiveMutation.mutateAsync({ id, archived: 1 })
    }
    setCheckedIds(new Set())
    setBulkLoading(false)
  }

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
    <div className="space-y-2">
      {/* Bulk action bar */}
      {someChecked && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted border border-border text-sm">
          <span className="text-muted-foreground">{checkedIds.size} selected</span>
          <button
            type="button"
            onClick={handleBulkArchive}
            disabled={bulkLoading}
            className="inline-flex h-7 items-center justify-center rounded-md border border-input px-3 text-xs hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {bulkLoading ? 'Archiving…' : 'Archive selected'}
          </button>
          <button
            type="button"
            onClick={() => setCheckedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="rounded"
                  title="Select all"
                />
              </th>
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
              <th onClick={() => handleSort('age')} className={thBase}>
                Age <SortIndicator col="age" />
              </th>
            </tr>
          </thead>
          <tbody
          ref={tbodyRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          onFocus={() => { if (focusedIndex === null && sorted.length > 0) setFocusedIndex(0) }}
          className="divide-y divide-border outline-none"
        >
            {sorted.map((app, idx) => {
              const days = daysAgo(app.last_activity_at)
              const isTerminal = app.status.is_terminal === 1
              const staleClass = !isTerminal && days !== null
                ? days >= 21
                  ? 'border-l-2 border-l-red-400'
                  : days >= 14
                    ? 'border-l-2 border-l-amber-400'
                    : ''
                : ''
              const checked = checkedIds.has(app.id)
              const isFocused = focusedIndex === idx
              return (
                <tr
                  key={app.id}
                  onClick={() => { setFocusedIndex(idx); onRowClick?.(app.id) }}
                  className={`transition-colors ${staleClass} ${onRowClick ? 'cursor-pointer' : ''} ${
                    checked ? 'bg-accent/60' : isFocused ? 'ring-1 ring-inset ring-ring' : selectedId === app.id ? 'bg-accent' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(app.id)}
                      className="rounded"
                    />
                  </td>
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
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <AgeBadge days={days} isTerminal={isTerminal} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
