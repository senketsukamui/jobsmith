import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  onDone: () => void
}

type Step = 'welcome' | 'ollama' | 'gmail' | 'done'

const DEFAULT_MODEL = 'qwen2.5:7b-instruct'

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full transition-colors ${
        done ? 'bg-primary' : active ? 'bg-primary/50' : 'bg-muted-foreground/30'
      }`}
    />
  )
}

export function OnboardingWizard({ onDone }: Props) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('welcome')

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  // Ollama
  const ollamaQuery = trpc.ollama.checkConnection.useQuery(undefined, {
    enabled: step === 'ollama',
    retry: false,
    refetchInterval: step === 'ollama' ? 3000 : false,
  })
  const modelsQuery = trpc.ollama.listModels.useQuery(undefined, {
    enabled: step === 'ollama' && ollamaQuery.data?.ok === true,
  })
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState('')
  const [pullDone, setPullDone] = useState(false)

  trpc.ollama.pullModel.useSubscription(DEFAULT_MODEL, {
    enabled: pulling,
    onData: (ev) => {
      const pct = ev.percent != null ? ` ${Math.round(ev.percent)}%` : ''
      setPullProgress(`${ev.status}${pct}`)
      if (ev.status === 'success') {
        setPulling(false)
        setPullDone(true)
        setSetting.mutate({ key: 'ollama_model', value: DEFAULT_MODEL })
        queryClient.invalidateQueries()
      }
    },
  })

  // Gmail
  const gmailQuery = trpc.gmail.isConnected.useQuery(undefined, { enabled: step === 'gmail' })
  const connectGmail = trpc.gmail.connect.useMutation()

  function finish() {
    setSetting.mutate({ key: 'onboarding_done', value: '1' })
    onDone()
  }

  const isOllamaConnected = ollamaQuery.data?.ok === true
  const hasModel = (modelsQuery.data ?? []).some((m) => m.includes('qwen2.5'))
  const modelReady = pullDone || hasModel

  const stepIndex = { welcome: 0, ollama: 1, gmail: 2, done: 3 }[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg p-8 space-y-6">

        {/* Progress dots */}
        {step !== 'welcome' && (
          <div className="flex items-center justify-center gap-2">
            <StepDot active={step === 'ollama'} done={stepIndex > 1} />
            <StepDot active={step === 'gmail'} done={stepIndex > 2} />
          </div>
        )}

        {step === 'welcome' && (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-xl font-semibold">Welcome to Jobsmith</h1>
              <p className="text-sm text-muted-foreground">
                A local-first app to track applications, scan Gmail, and generate cover letters.
                Let's get you set up in two quick steps.
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
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">1 / 2 — Ollama (AI features)</h2>
              <p className="text-sm text-muted-foreground">
                Jobsmith uses Ollama for cover letters, email classification, and reply drafting.
              </p>
            </div>

            {/* Connection status */}
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                {ollamaQuery.isLoading ? (
                  <span className="text-muted-foreground">Checking…</span>
                ) : isOllamaConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <span>Ollama is running</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-muted-foreground">
                      Ollama not detected. Install from{' '}
                      <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ollama.com</span>
                      , then this will update automatically.
                    </span>
                  </>
                )}
              </div>

              {/* Model pull — only when Ollama is connected */}
              {isOllamaConnected && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center gap-2 text-sm">
                    {modelReady ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span>
                          <span className="font-mono text-xs">{DEFAULT_MODEL}</span> is ready
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-muted-foreground text-xs">
                          Recommended model not found
                        </span>
                      </>
                    )}
                  </div>

                  {!modelReady && !pulling && (
                    <button
                      type="button"
                      onClick={() => { setPullProgress(''); setPulling(true) }}
                      className="h-7 inline-flex items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Pull {DEFAULT_MODEL}
                    </button>
                  )}

                  {pulling && (
                    <div className="space-y-1.5">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300 rounded-full"
                          style={{
                            width: pullProgress.match(/(\d+)%/)?.[1]
                              ? `${pullProgress.match(/(\d+)%/)![1]}%`
                              : '5%',
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{pullProgress || 'Starting…'}</p>
                    </div>
                  )}
                </div>
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
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">2 / 2 — Gmail</h2>
              <p className="text-sm text-muted-foreground">
                Connect Gmail to automatically scan for application updates and interview invites.
                You can also do this later in Settings.
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
                  {connectGmail.isLoading ? 'Opening browser…' : 'Connect Gmail'}
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
                {gmailQuery.data ? 'Finish ✓' : 'Finish'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
