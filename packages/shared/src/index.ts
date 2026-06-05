import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ApplicationSourceSchema = z.enum([
  'linkedin',
  'lever',
  'greenhouse',
  'manual',
  'other',
])
export type ApplicationSource = z.infer<typeof ApplicationSourceSchema>

export const StatusHistorySourceSchema = z.enum([
  'manual',
  'email',
  'extension',
  'system',
])
export type StatusHistorySource = z.infer<typeof StatusHistorySourceSchema>

export const EmailClassificationSchema = z.enum([
  'acknowledgment',
  'rejection',
  'interview_invite',
  'offer',
  'follow_up_request',
  'unrelated',
  'unclear',
])
export type EmailClassification = z.infer<typeof EmailClassificationSchema>

export const EmailUserActionSchema = z.enum(['pending', 'accepted', 'dismissed'])
export type EmailUserAction = z.infer<typeof EmailUserActionSchema>

// ─── Entity schemas ───────────────────────────────────────────────────────────

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  careers_url: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type Company = z.infer<typeof CompanySchema>

export const StatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  display_order: z.number(),
  color: z.string(),
  is_terminal: z.number(),
  is_default_new: z.number(),
  created_at: z.number(),
})
export type Status = z.infer<typeof StatusSchema>

export const ApplicationSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  role_title: z.string(),
  job_description: z.string().nullable(),
  job_url: z.string().nullable(),
  source: ApplicationSourceSchema,
  cv_id: z.string().nullable(),
  current_status_id: z.string(),
  applied_at: z.number().nullable(),
  last_activity_at: z.number().nullable(),
  page_markdown: z.string().nullable(),
  archived: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type Application = z.infer<typeof ApplicationSchema>

export const ApplicationWithRelationsSchema = ApplicationSchema.extend({
  company: CompanySchema,
  status: StatusSchema,
})
export type ApplicationWithRelations = z.infer<typeof ApplicationWithRelationsSchema>

export const ApplicationStatusHistorySchema = z.object({
  id: z.string(),
  application_id: z.string(),
  status_id: z.string(),
  changed_at: z.number(),
  source: StatusHistorySourceSchema,
  note: z.string().nullable(),
})
export type ApplicationStatusHistory = z.infer<typeof ApplicationStatusHistorySchema>

export const ApplicationStatusHistoryWithStatusSchema = ApplicationStatusHistorySchema.extend({
  status: StatusSchema,
})
export type ApplicationStatusHistoryWithStatus = z.infer<typeof ApplicationStatusHistoryWithStatusSchema>

export const CvSchema = z.object({
  id: z.string(),
  name: z.string(),
  file_path: z.string(),
  original_filename: z.string().nullable(),
  mime_type: z.string().nullable(),
  extracted_text: z.string().nullable(),
  is_default: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type Cv = z.infer<typeof CvSchema>

export const CoverLetterSchema = z.object({
  id: z.string(),
  application_id: z.string(),
  cv_id: z.string().nullable(),
  custom_instructions: z.string().nullable(),
  generated_content: z.string(),
  model_used: z.string(),
  generation_time_ms: z.number().nullable(),
  is_edited: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type CoverLetter = z.infer<typeof CoverLetterSchema>

export const EmailSchema = z.object({
  id: z.string(),
  gmail_message_id: z.string(),
  gmail_thread_id: z.string().nullable(),
  subject: z.string().nullable(),
  from_address: z.string().nullable(),
  from_name: z.string().nullable(),
  received_at: z.number().nullable(),
  body_snippet: z.string().nullable(),
  classification: EmailClassificationSchema.nullable(),
  confidence: z.number().nullable(),
  suggested_status_id: z.string().nullable(),
  linked_application_id: z.string().nullable(),
  linked_company_id: z.string().nullable(),
  user_action: EmailUserActionSchema,
  raw_llm_output: z.string().nullable(),
  processed_at: z.number(),
})
export type Email = z.infer<typeof EmailSchema>

export const SettingsSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.number(),
})
export type Settings = z.infer<typeof SettingsSchema>

// ─── Input schemas (tRPC) ─────────────────────────────────────────────────────

export const CreateApplicationInput = z.object({
  company: z.object({
    name: z.string().min(1),
    website: z.string().optional(),
  }),
  role_title: z.string().min(1),
  job_description: z.string().optional(),
  job_url: z.string().optional(),
  source: ApplicationSourceSchema.default('manual'),
  cv_id: z.string().nullable().optional(),
  applied_at: z.number().optional(),
  page_markdown: z.string().optional(),
})
export type CreateApplicationInput = z.infer<typeof CreateApplicationInput>

export const UpdateApplicationInput = z.object({
  id: z.string(),
  role_title: z.string().min(1).optional(),
  job_description: z.string().nullable().optional(),
  job_url: z.string().nullable().optional(),
  source: ApplicationSourceSchema.optional(),
  cv_id: z.string().nullable().optional(),
  archived: z.number().optional(),
})
export type UpdateApplicationInput = z.infer<typeof UpdateApplicationInput>

export const ChangeStatusInput = z.object({
  id: z.string(),
  status_id: z.string(),
  note: z.string().optional(),
})
export type ChangeStatusInput = z.infer<typeof ChangeStatusInput>

export const ListApplicationsInput = z.object({
  status_ids: z.array(z.string()).optional(),
  source: ApplicationSourceSchema.optional(),
  query: z.string().optional(),
  archived: z.boolean().optional(),
})
export type ListApplicationsInput = z.infer<typeof ListApplicationsInput>

export const CreateCompanyInput = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  careers_url: z.string().optional(),
  notes: z.string().optional(),
})
export type CreateCompanyInput = z.infer<typeof CreateCompanyInput>

export const CreateStatusInput = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  is_terminal: z.number().int().min(0).max(1).optional(),
})
export type CreateStatusInput = z.infer<typeof CreateStatusInput>

export const UpdateStatusInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  is_terminal: z.number().int().min(0).max(1).optional(),
  is_default_new: z.number().int().min(0).max(1).optional(),
})
export type UpdateStatusInput = z.infer<typeof UpdateStatusInput>
