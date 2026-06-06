import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface ToastItem {
  id: number
  message: string
  variant: 'default' | 'success' | 'error'
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastItem['variant']) => void
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

  const toast = useCallback((message: string, variant: ToastItem['variant'] = 'default') => {
    const id = nextId++
    setItems((prev) => [...prev, { id, message, variant }])
    const t = setTimeout(() => dismiss(id), 4000)
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
            onClick={() => dismiss(item.id)}
            className={`
              pointer-events-auto flex items-start gap-3 min-w-[260px] max-w-[360px]
              rounded-lg border shadow-lg px-4 py-3 text-sm cursor-pointer
              animate-in slide-in-from-bottom-2 fade-in duration-200
              ${item.variant === 'success'
                ? 'bg-card border-green-200 text-foreground'
                : item.variant === 'error'
                ? 'bg-card border-destructive/30 text-foreground'
                : 'bg-card border-border text-foreground'}
            `}
          >
            <span className={`mt-0.5 shrink-0 text-base leading-none ${
              item.variant === 'success' ? 'text-green-500' :
              item.variant === 'error'   ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {item.variant === 'success' ? '✓' : item.variant === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="leading-snug">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
