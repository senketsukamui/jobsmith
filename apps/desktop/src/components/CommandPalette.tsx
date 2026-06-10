import { useState, useEffect, useRef, useMemo } from 'react'
import { trpc } from '@/lib/trpc'

type Page = 'applications' | 'stats' | 'emails' | 'settings'

interface CommandPaletteProps {
  onNavigate: (page: Page) => void
  onNewApplication: () => void
}

interface Item {
  id: string
  label: string
  sub?: string
  action: () => void
  icon: string
}

const PAGE_ITEMS = (onNavigate: (p: Page) => void): Item[] => [
  { id: 'nav-apps',      label: 'Applications',  icon: '📋', action: () => onNavigate('applications') },
  { id: 'nav-stats',     label: 'Stats',          icon: '📊', action: () => onNavigate('stats') },
  { id: 'nav-emails',    label: 'Emails',         icon: '✉️', action: () => onNavigate('emails') },
  { id: 'nav-settings',  label: 'Settings',       icon: '⚙️', action: () => onNavigate('settings') },
]

export function CommandPalette({ onNavigate, onNewApplication }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const appsQuery = trpc.applications.list.useQuery(
    { query: query.trim() || undefined },
    { enabled: open, staleTime: 5_000 }
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.toLowerCase().trim()

    const staticItems: Item[] = [
      { id: 'action-new', label: 'New application', icon: '+', action: () => { onNewApplication(); setOpen(false) } },
      ...PAGE_ITEMS((p) => { onNavigate(p); setOpen(false) }),
    ].filter((item) => !q || item.label.toLowerCase().includes(q))

    const appItems: Item[] = (appsQuery.data ?? [])
      .filter((a) => a.archived === 0)
      .map((a) => ({
        id: `app-${a.id}`,
        label: a.company.name,
        sub: a.role_title,
        icon: '📌',
        action: () => { onNavigate('applications'); setOpen(false) },
      }))

    return [...staticItems, ...appItems].slice(0, 8)
  }, [query, appsQuery.data, onNavigate, onNewApplication])

  useEffect(() => { setActiveIdx(0) }, [items.length])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[activeIdx]?.action() }
    else if (e.key === 'Escape') setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-sm">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search applications, navigate…"
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          )}
        </div>

        {/* Results */}
        <ul className="py-1 max-h-72 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No results</li>
          )}
          {items.map((item, idx) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.action}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  idx === activeIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                <span className="text-base leading-none w-5 text-center shrink-0">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{item.label}</span>
                  {item.sub && <span className="ml-2 text-xs text-muted-foreground truncate">{item.sub}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="px-4 py-2 border-t border-border flex gap-4 text-[11px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
