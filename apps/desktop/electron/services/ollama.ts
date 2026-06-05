import { Ollama } from 'ollama'
import { getSetting } from './settings'

async function getClient() {
  const host = await getSetting('ollama_host') ?? 'http://localhost:11434'
  return new Ollama({ host })
}

export async function listModels(): Promise<string[]> {
  const client = await getClient()
  const res = await client.list()
  return res.models.map((m) => m.name)
}

export async function isModelAvailable(model: string): Promise<boolean> {
  try {
    const models = await listModels()
    return models.some((m) => m === model || m.startsWith(model + ':'))
  } catch {
    return false
  }
}

export async function checkConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await listModels()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function* streamGenerate(
  model: string,
  prompt: string,
  onToken?: (chunk: string) => void,
  options?: { format?: 'json' }
): AsyncGenerator<string> {
  const client = await getClient()
  const stream = await client.generate({ model, prompt, stream: true, format: options?.format })
  for await (const chunk of stream) {
    const token = chunk.response
    if (token) {
      onToken?.(token)
      yield token
    }
  }
}

export async function* pullModel(model: string): AsyncGenerator<{ status: string; percent?: number }> {
  const client = await getClient()
  const stream = await client.pull({ model, stream: true })
  for await (const chunk of stream) {
    const percent =
      chunk.total && chunk.completed
        ? Math.round((chunk.completed / chunk.total) * 100)
        : undefined
    yield { status: chunk.status, percent }
  }
}
