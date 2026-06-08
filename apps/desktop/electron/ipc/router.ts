import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  ChangeStatusInput,
  ListApplicationsInput,
  CreateCompanyInput,
  CreateStatusInput,
  UpdateStatusInput,
} from '@jobsmith/shared'
import * as ApplicationService from '../services/applications'
import * as CompanyService from '../services/companies'
import * as StatusService from '../services/statuses'
import * as CvService from '../services/cvs'
import * as CoverLetterService from '../services/coverLetters'
import * as OllamaService from '../services/ollama'
import * as SettingsService from '../services/settings'
import * as PairingService from '../services/pairing'
import * as GmailService from '../services/gmail'
import * as EmailScannerService from '../services/emailScanner'
import * as ExportService from '../services/export'
import * as SyncConfigService from '../services/syncConfig'
import { syncNow } from '../db/client'
import { updateBadgeCount } from '../services/notifications'

const t = initTRPC.create({ isServer: true })
const router = t.router
const procedure = t.procedure

// ─── Applications ─────────────────────────────────────────────────────────────

const applicationsRouter = router({
  list: procedure.input(ListApplicationsInput.optional()).query(({ input }) =>
    ApplicationService.listApplications(input ?? {})
  ),
  create: procedure.input(CreateApplicationInput).mutation(({ input }) =>
    ApplicationService.createApplication(input)
  ),
  get: procedure.input(z.string()).query(({ input }) =>
    ApplicationService.getApplication(input)
  ),
  update: procedure.input(UpdateApplicationInput).mutation(({ input }) =>
    ApplicationService.updateApplication(input)
  ),
  delete: procedure.input(z.string()).mutation(({ input }) =>
    ApplicationService.deleteApplication(input)
  ),
  changeStatus: procedure.input(ChangeStatusInput).mutation(({ input }) =>
    ApplicationService.changeStatus(input)
  ),
  history: procedure.input(z.string()).query(({ input }) =>
    ApplicationService.getApplicationHistory(input)
  ),
  archive: procedure
    .input(z.object({ id: z.string(), archived: z.number().int().min(0).max(1) }))
    .mutation(({ input }) =>
      ApplicationService.updateApplication({ id: input.id, archived: input.archived })
    ),
  stale: procedure.input(z.number().optional()).query(({ input }) =>
    ApplicationService.getStaleApplications(input ?? 7)
  ),
  parseMarkdown: procedure.input(z.string()).mutation(({ input }) =>
    ApplicationService.parseApplicationMarkdown(input)
  ),
})

// ─── Companies ────────────────────────────────────────────────────────────────

const companiesRouter = router({
  list: procedure.input(z.string().optional()).query(({ input }) =>
    CompanyService.listCompanies(input)
  ),
  create: procedure.input(CreateCompanyInput).mutation(({ input }) =>
    CompanyService.createCompany(input)
  ),
})

// ─── Statuses ─────────────────────────────────────────────────────────────────

const statusesRouter = router({
  list: procedure.query(() => StatusService.listStatuses()),
  create: procedure.input(CreateStatusInput).mutation(({ input }) =>
    StatusService.createStatus(input)
  ),
  update: procedure.input(UpdateStatusInput).mutation(({ input }) =>
    StatusService.updateStatus(input)
  ),
  delete: procedure.input(z.string()).mutation(({ input }) =>
    StatusService.deleteStatus(input)
  ),
  reorder: procedure.input(z.array(z.string())).mutation(({ input }) =>
    StatusService.reorderStatuses(input)
  ),
})

// ─── CVs ──────────────────────────────────────────────────────────────────────

const cvsRouter = router({
  list: procedure.query(() => CvService.listCvs()),

  upload: procedure.mutation(() => CvService.uploadCv()),

  setDefault: procedure.input(z.string()).mutation(({ input }) =>
    CvService.setDefaultCv(input)
  ),

  delete: procedure.input(z.string()).mutation(({ input }) =>
    CvService.deleteCv(input)
  ),

  updateText: procedure
    .input(z.object({ id: z.string(), text: z.string() }))
    .mutation(({ input }) => CvService.updateCvText(input.id, input.text)),
})

// ─── Cover letters ────────────────────────────────────────────────────────────

const GenerateInput = z.object({
  application_id: z.string(),
  cv_id: z.string().nullable().optional(),
  custom_instructions: z.string().nullable().optional(),
})

type GenerateEvent =
  | { chunk: string }
  | { id: string; generation_time_ms: number }
  | { error: string }

const coverLettersRouter = router({
  generate: procedure.input(GenerateInput).subscription(({ input }) =>
    observable<GenerateEvent>((emit) => {
      async function run() {
        for await (const event of CoverLetterService.generateCoverLetter(input)) {
          if (event.error) {
            emit.next({ error: event.error })
            emit.complete()
            return
          }
          if (event.chunk) emit.next({ chunk: event.chunk })
          if (event.id) {
            emit.next({ id: event.id, generation_time_ms: event.generation_time_ms ?? 0 })
            emit.complete()
          }
        }
      }
      run().catch((err) => emit.next({ error: String(err) }))
      return () => {}
    })
  ),

  list: procedure.input(z.string()).query(({ input }) =>
    CoverLetterService.listCoverLetters(input)
  ),

  update: procedure
    .input(z.object({ id: z.string(), content: z.string() }))
    .mutation(({ input }) => CoverLetterService.updateCoverLetter(input.id, input.content)),

  delete: procedure.input(z.string()).mutation(({ input }) =>
    CoverLetterService.deleteCoverLetter(input)
  ),
})

// ─── Ollama ───────────────────────────────────────────────────────────────────

const PullEvent = z.object({ status: z.string(), percent: z.number().optional() })

const ollamaRouter = router({
  checkConnection: procedure.query(() => OllamaService.checkConnection()),

  listModels: procedure.query(() => OllamaService.listModels()),

  isModelAvailable: procedure.input(z.string()).query(({ input }) =>
    OllamaService.isModelAvailable(input)
  ),

  pullModel: procedure.input(z.string()).subscription((opts) =>
    observable<z.infer<typeof PullEvent>>((emit) => {
      async function run() {
        for await (const event of OllamaService.pullModel(opts.input)) {
          emit.next(event)
        }
        emit.complete()
      }
      run().catch((err) => emit.error(new Error(String(err))))
      return () => {}
    })
  ),
})

// ─── Settings ─────────────────────────────────────────────────────────────────

const settingsRouter = router({
  getAll: procedure.query(() => SettingsService.getAllSettings()),

  set: procedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ input }) => SettingsService.setSetting(input.key, input.value)),

  getPairingToken: procedure.query(() => PairingService.getOrCreatePairingToken()),

  rotatePairingToken: procedure.mutation(() => PairingService.rotatePairingToken()),
})

// ─── Gmail ────────────────────────────────────────────────────────────────────

const gmailRouter = router({
  isConnected: procedure.query(() => GmailService.isConnected()),

  connect: procedure.mutation(() => GmailService.startOAuthFlow()),

  disconnect: procedure.mutation(() => GmailService.disconnect()),
})

// ─── Emails ───────────────────────────────────────────────────────────────────

const emailsRouter = router({
  pending: procedure.query(() => EmailScannerService.getPendingEmails()),

  scanNow: procedure.mutation(() => EmailScannerService.scanEmails()),

  accept: procedure.input(z.string()).mutation(({ input }) =>
    EmailScannerService.acceptEmailSuggestion(input)
  ),

  dismiss: procedure.input(z.string()).mutation(({ input }) =>
    EmailScannerService.dismissEmailSuggestion(input)
  ),

  linkToApplication: procedure
    .input(z.object({ emailId: z.string(), applicationId: z.string() }))
    .mutation(({ input }) =>
      EmailScannerService.linkEmailToApplication(input.emailId, input.applicationId)
    ),
  syncBadge: procedure.mutation(() => updateBadgeCount()),

  history: procedure.query(() => EmailScannerService.getRecentEmails()),
})

// ─── Export ───────────────────────────────────────────────────────────────────

const exportRouter = router({
  csv: procedure.mutation(() => ExportService.exportToCsv()),
  notion: procedure.mutation(() => ExportService.exportToNotion()),
  validateNotion: procedure.query(() => ExportService.validateNotionConnection()),
})

// ─── Sync ─────────────────────────────────────────────────────────────────────

const syncRouter = router({
  get: procedure.query(() => SyncConfigService.getSyncConfigPublic()),
  set: procedure
    .input(z.object({ syncUrl: z.string().url(), authToken: z.string().min(1) }))
    .mutation(({ input }) => {
      SyncConfigService.writeSyncConfig(input.syncUrl, input.authToken)
      return { ok: true }
    }),
  clear: procedure.mutation(() => {
    SyncConfigService.clearSyncConfig()
    return { ok: true }
  }),
  test: procedure
    .input(z.object({ syncUrl: z.string(), authToken: z.string() }))
    .mutation(({ input }) => SyncConfigService.testSyncConnection(input.syncUrl, input.authToken)),
  syncNow: procedure.mutation(() => syncNow()),
})

// ─── App router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  applications: applicationsRouter,
  companies: companiesRouter,
  statuses: statusesRouter,
  cvs: cvsRouter,
  coverLetters: coverLettersRouter,
  ollama: ollamaRouter,
  settings: settingsRouter,
  gmail: gmailRouter,
  emails: emailsRouter,
  export: exportRouter,
  sync: syncRouter,
})

export type AppRouter = typeof appRouter
