import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  onDone: () => void
}

type Step = 'welcome' | 'ollama' | 'gmail' | 'done'

export function OnboardingWizard({ onDone }: Props) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('welcome')

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const ollamaQuery = trpc.ollama.checkConnection.useQuery(undefined, {
    enabled: step === 'ollama',
    retry: false,
  })
  const gmailQuery = trpc.gmail.isConnected.useQuery(undefined, { enabled: step === 'gmail' })
  const connectGmail = trpc.gmail.connect.useMutation()

  function finish() {
    setSetting.mutate({ key: 'onboarding_done', value: '1' })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg p-8 space-y-6">

        {step === 'welcome' && (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-xl font-semibold">Welcome to Job Tracker</h1>
              <p className="text-sm text-muted-foreground">
                A local-first app to track applications, scan Gmail, and generate cover letters. Let's get you set up in a few steps.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={finish} className="text-sm text-muted-foreground hover:text-foreground underline">
                Skip setup
              </button>
              <button
                type="button"
                onClick={() => setStep('ollama')}
                className="h-9 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Get started →
              </button>
            </div>
          </>
        )}

        {step === 'ollama' && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">1 / 2 — Ollama (AI)</h2>
              <p className="text-sm text-muted-foreground">
                Job Tracker uses Ollama for cover letter generation and email classification. Install it from{' '}
                <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ollama.com</span> and run{' '}
                <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ollama pull qwen2.5:7b-instruct</span>.
              </p>
            </div>
            <div className="rounded-md border border-border p-3 flex items-center gap-2 text-sm">
              {ollamaQuery.isLoading ? (
                <span className="text-muted-foreground">Checking connection…</span>
              ) : ollamaQuery.data?.ok ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span>Ollama is running</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-muted-foreground">Ollama not detected — you can set it up later in Settings.</span>
                </>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={finish} className="text-sm text-muted-foreground hover:text-foreground underline">
                Skip
              </button>
              <button
                type="button"
                onClick={() => setStep('gmail')}
                className="h-9 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'gmail' && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">2 / 2 — Gmail</h2>
              <p className="text-sm text-muted-foreground">
                Connect Gmail to automatically scan for application updates and interview invites. You can also do this later in Settings.
              </p>
            </div>
            <div className="rounded-md border border-border p-3 flex items-center gap-3 text-sm">
              {gmailQuery.data ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span>Gmail connected</span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => connectGmail.mutate()}
                  disabled={connectGmail.isLoading}
                  className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Connect Gmail
                </button>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={finish} className="text-sm text-muted-foreground hover:text-foreground underline">
                Skip
              </button>
              <button
                type="button"
                onClick={finish}
                className="h-9 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Finish
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
