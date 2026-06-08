import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'

type Page = 'applications' | 'stats' | 'emails' | 'settings'

interface SidebarProps {
  active: Page
  onNavigate: (page: Page) => void
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return [dark, setDark] as const
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const [dark, setDark] = useDarkMode()

  const pendingQuery = trpc.emails.pending.useQuery(undefined, {
    refetchInterval: 60_000,
  })
  const pendingCount = (pendingQuery.data ?? []).length

  const NAV: { id: Page; label: string; icon: string; badge?: number }[] = [
    { id: 'applications', label: 'Applications', icon: '📋' },
    { id: 'stats', label: 'Stats', icon: '📊' },
    { id: 'emails', label: 'Emails', icon: '✉️', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <aside className="flex flex-col w-44 shrink-0 border-r border-border bg-muted/30 pt-10">
      <nav className="flex flex-col gap-0.5 px-2 flex-1">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
              active === item.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge != null && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="text-base leading-none">{dark ? '☀️' : '🌙'}</span>
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
  )
}
