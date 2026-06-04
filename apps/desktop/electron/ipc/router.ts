import { initTRPC } from '@trpc/server'
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

const t = initTRPC.create({ isServer: true })
const router = t.router
const procedure = t.procedure

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

const companiesRouter = router({
  list: procedure.input(z.string().optional()).query(({ input }) =>
    CompanyService.listCompanies(input)
  ),

  create: procedure.input(CreateCompanyInput).mutation(({ input }) =>
    CompanyService.createCompany(input)
  ),
})

const statusesRouter = router({
  list: procedure.query(() => StatusService.listStatuses()),
})

export const appRouter = router({
  applications: applicationsRouter,
  companies: companiesRouter,
  statuses: statusesRouter,
})

export type AppRouter = typeof appRouter
