import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface ToastItem {
  id: number
  message: string
  variant: 'default' | 'success' | 'error'
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastItem['variant'], action?: ToastItem['action']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const toast = useCallback((
    message: string,
    variant: ToastItem['variant'] = 'default',
    action?: ToastItem['action'],
  ) => {
    const id = nextId++
    setItems((prev) => [...prev, { id, message, variant, action }])
    // Give more time when there's an action so user can react
    const delay = action ? 6000 : 4000
    const t = setTimeout(() => dismiss(id), delay)
    timers.current.set(id, t)
  }, [dismiss])

  useEffect(() => {
    const map = timers.current
    return () => { map.forEach(clearTimeout) }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className={`
              pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-[380px]
              rounded-lg border shadow-lg px-4 py-3 text-sm
              animate-in slide-in-from-bottom-2 fade-in duration-200
              ${item.variant === 'success'
                ? 'bg-card border-green-200 text-foreground'
                : item.variant === 'error'
                ? 'bg-card border-destructive/30 text-foreground'
                : 'bg-card border-border text-foreground'}
            `}
          >
            <span className={`shrink-0 text-base leading-none ${
              item.variant === 'success' ? 'text-green-500' :
              item.variant === 'error'   ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {item.variant === 'success' ? '✓' : item.variant === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="leading-snug flex-1">{item.message}</span>
            {item.action && (
              <button
                type="button"
                onClick={() => { item.action!.onClick(); dismiss(item.id) }}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground text-xs leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
