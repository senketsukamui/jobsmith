import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { validateToken } from './pairing'
import * as ApplicationService from './applications'
import * as CompanyService from './companies'
import * as StatusService from './statuses'
import { CreateApplicationInput } from '@job-tracker/shared'

const PORT_MIN = 53700
const PORT_MAX = 53800

function discoveryFilePath(): string {
  return path.join(app.getPath('userData'), 'server.json')
}

function writeDiscoveryFile(port: number): void {
  fs.writeFileSync(
    discoveryFilePath(),
    JSON.stringify({ port, version: app.getVersion() }),
    'utf-8'
  )
}

async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers['authorization']
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing bearer token' })
    return
  }
  const token = auth.slice(7)
  if (!(await validateToken(token))) {
    reply.code(403).send({ error: 'Invalid token' })
  }
}

export async function startHttpServer(): Promise<number> {
  const server = Fastify({ logger: false })

  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin.startsWith('chrome-extension://')) {
        cb(null, true)
      } else {
        cb(new Error('CORS blocked'), false)
      }
    },
    credentials: true,
  })

  // ── Health ──────────────────────────────────────────────────────────────────

  server.get('/api/health', async () => ({
    status: 'ok',
    version: app.getVersion(),
  }))

  // ── Applications ────────────────────────────────────────────────────────────

  server.get(
    '/api/applications',
    { preHandler: authMiddleware },
    async (req) => {
      const q = req.query as { status?: string; q?: string }
      return ApplicationService.listApplications({ query: q.q })
    }
  )

  server.post(
    '/api/applications',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const parsed = CreateApplicationInput.safeParse(req.body)
      if (!parsed.success) {
        reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() })
        return
      }
      const app = await ApplicationService.createApplication(parsed.data)
      reply.code(201).send(app)
    }
  )

  server.get(
    '/api/applications/:id',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const result = await ApplicationService.getApplication(id)
      if (!result) { reply.code(404).send({ error: 'Not found' }); return }
      return result
    }
  )

  server.delete(
    '/api/applications/:id',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await ApplicationService.deleteApplication(id)
      reply.code(204).send()
    }
  )

  server.post(
    '/api/applications/:id/status',
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = req.body as { status_id: string; note?: string }
      if (!body?.status_id) { reply.code(400).send({ error: 'status_id required' }); return }
      const entry = await ApplicationService.changeStatus({ id, status_id: body.status_id, note: body.note })
      return entry
    }
  )

  server.get(
    '/api/applications/:id/history',
    { preHandler: authMiddleware },
    async (req) => {
      const { id } = req.params as { id: string }
      return ApplicationService.getApplicationHistory(id)
    }
  )

  // ── Companies ───────────────────────────────────────────────────────────────

  server.get(
    '/api/companies',
    { preHandler: authMiddleware },
    async (req) => {
      const q = req.query as { q?: string }
      return CompanyService.listCompanies(q.q)
    }
  )

  // ── Statuses ────────────────────────────────────────────────────────────────

  server.get(
    '/api/statuses',
    { preHandler: authMiddleware },
    async () => StatusService.listStatuses()
  )

  // ── Port discovery ──────────────────────────────────────────────────────────

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    try {
      await server.listen({ port, host: '127.0.0.1' })
      writeDiscoveryFile(port)
      return port
    } catch {
      if (port === PORT_MAX) throw new Error('No available port in range 53700-53800')
    }
  }

  throw new Error('Failed to start HTTP server')
}
