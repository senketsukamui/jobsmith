import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import { trpc } from '@/lib/trpc'
import { Sidebar } from '@/components/Sidebar'
import { ApplicationsPage } from '@/routes/ApplicationsPage'
import { EmailsPage } from '@/routes/EmailsPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { OnboardingWizard } from '@/components/OnboardingWizard'

type Page = 'applications' | 'emails' | 'settings'

function AppInner() {
  const [page, setPage] = useState<Page>('applications')
  const settingsQuery = trpc.settings.getAll.useQuery()
  const onboardingDone = settingsQuery.data?.onboarding_done === '1'
  const [wizardDismissed, setWizardDismissed] = useState(false)

  const showWizard = !settingsQuery.isLoading && !onboardingDone && !wizardDismissed

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="flex-1 min-w-0 overflow-hidden">
        {page === 'applications' && <ApplicationsPage />}
        {page === 'emails' && <EmailsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
      {showWizard && (
        <OnboardingWizard onDone={() => setWizardDismissed(true)} />
      )}
    </div>
  )
}

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } })
  )
  const [trpcClient] = useState(() => trpc.createClient({ links: [ipcLink()] }))

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </trpc.Provider>
  )
}
