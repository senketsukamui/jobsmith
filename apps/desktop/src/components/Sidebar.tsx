import { cn } from '@/lib/utils'

type Page = 'applications' | 'settings'

interface SidebarProps {
  active: Page
  onNavigate: (page: Page) => void
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'applications', label: 'Applications', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="flex flex-col w-44 shrink-0 border-r border-border bg-muted/30 pt-10">
      <nav className="flex flex-col gap-0.5 px-2">
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
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
