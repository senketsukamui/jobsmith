import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import { trpc } from '@/lib/trpc'
import { ApplicationsPage } from '@/routes/ApplicationsPage'

export function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 5_000 },
    },
  }))

  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [ipcLink()] })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="flex h-screen flex-col overflow-hidden">
          <ApplicationsPage />
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
