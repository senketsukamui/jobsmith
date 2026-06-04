import { initTRPC } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  ChangeStatusInput,
  ListApplicationsInput,
  CreateCompanyInput,
} from '@job-tracker/shared'
import * as ApplicationService from '../services/applications'
import * as CompanyService from '../services/companies'
import * as StatusService from '../services/statuses'
import * as CvService from '../services/cvs'
import * as CoverLetterService from '../services/coverLetters'
import * as OllamaService from '../services/ollama'
import * as SettingsService from '../services/settings'

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
})

export type AppRouter = typeof appRouter
