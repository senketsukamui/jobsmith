import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import { trpc } from '@/lib/trpc'
import { Sidebar } from '@/components/Sidebar'
import { ApplicationsPage } from '@/routes/ApplicationsPage'
import { SettingsPage } from '@/routes/SettingsPage'

type Page = 'applications' | 'settings'

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } })
  )
  const [trpcClient] = useState(() => trpc.createClient({ links: [ipcLink()] }))
  const [page, setPage] = useState<Page>('applications')

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar active={page} onNavigate={setPage} />
          <main className="flex-1 min-w-0 overflow-hidden">
            {page === 'applications' ? <ApplicationsPage /> : <SettingsPage />}
          </main>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
