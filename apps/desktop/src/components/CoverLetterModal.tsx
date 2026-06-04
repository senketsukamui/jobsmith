import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

interface CoverLetterModalProps {
  applicationId: string
  initialCvId?: string | null
  onClose: () => void
}

export function CoverLetterModal({ applicationId, initialCvId, onClose }: CoverLetterModalProps) {
  const queryClient = useQueryClient()
  const cvsQuery = trpc.cvs.list.useQuery()
  const cvs = cvsQuery.data ?? []
  const defaultCv = cvs.find((c) => c.is_default === 1)

  const [cvId, setCvId] = useState<string>(
    initialCvId ?? defaultCv?.id ?? cvs[0]?.id ?? ''
  )
  const [instructions, setInstructions] = useState('')
  const [content, setContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [genTimeMs, setGenTimeMs] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // keep cvId in sync when cvs load
  useEffect(() => {
    if (!cvId && cvs.length > 0) {
      setCvId(initialCvId ?? defaultCv?.id ?? cvs[0]?.id ?? '')
    }
  }, [cvs.length])

  trpc.coverLetters.generate.useSubscription(
    { application_id: applicationId, cv_id: cvId || null, custom_instructions: instructions || null },
    {
      enabled: streaming,
      onData: (ev) => {
        if ('error' in ev) {
          setError(ev.error)
          setStreaming(false)
        } else if ('chunk' in ev) {
          setContent((prev) => prev + ev.chunk)
        } else if ('id' in ev) {
          setSavedId(ev.id)
          setGenTimeMs(ev.generation_time_ms)
          setStreaming(false)
          setDone(true)
          queryClient.invalidateQueries()
        }
      },
    }
  )

  function handleGenerate() {
    setContent('')
    setSavedId(null)
    setDone(false)
    setError('')
    setStreaming(true)
  }

  const saveEdit = trpc.coverLetters.update.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  })

  function handleSaveEdit() {
    if (!savedId) return
    saveEdit.mutate({ id: savedId, content })
  }

  function handleCopy() {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex flex-col w-full max-w-2xl max-h-[90vh] bg-background rounded-xl border border-border shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">Generate cover letter</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        {/* Controls */}
        <div className="flex gap-3 px-5 py-3 border-b border-border shrink-0 flex-wrap">
          {/* CV picker */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <label className="text-xs font-medium text-muted-foreground">CV</label>
            <select
              value={cvId}
              onChange={(e) => setCvId(e.target.value)}
              disabled={streaming}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">None</option>
              {cvs.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.name}{cv.is_default ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Custom instructions */}
          <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Custom instructions</label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={streaming}
              placeholder="e.g. be casual, mention passion for their product…"
              className="h-8 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>

          {/* Generate button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={streaming}
              className="h-8 shrink-0 inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {streaming ? 'Generating…' : done ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col px-5 py-3 gap-2 min-h-0">
          {error && (
            <p className="text-sm text-destructive shrink-0">{error}</p>
          )}
          {!streaming && !done && !content && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Click Generate to create a cover letter.
            </div>
          )}
          {(streaming || done || content) && (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={streaming}
              className="flex-1 min-h-0 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
          )}
          {streaming && (
            <p className="text-xs text-muted-foreground shrink-0 animate-pulse">Writing…</p>
          )}
          {done && genTimeMs && (
            <p className="text-xs text-muted-foreground shrink-0">
              Generated in {(genTimeMs / 1000).toFixed(1)}s
              {savedId && ' · Saved'}
            </p>
          )}
        </div>

        {/* Footer */}
        {done && content && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="h-8 inline-flex items-center justify-center rounded-md border border-input px-3 text-sm hover:bg-accent transition-colors"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saveEdit.isLoading || !savedId}
              className="h-8 inline-flex items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saveEdit.isLoading ? 'Saving…' : 'Save edits'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
