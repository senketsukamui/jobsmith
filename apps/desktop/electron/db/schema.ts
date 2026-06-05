import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import type { ApplicationSource, StatusHistorySource, EmailClassification, EmailUserAction } from '@job-tracker/shared'

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    website: text('website'),
    careers_url: text('careers_url'),
    notes: text('notes'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('companies_name_lower_idx').on(sql`lower(${t.name})`)]
)

export const statuses = sqliteTable('statuses', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  display_order: integer('display_order').notNull(),
  color: text('color').notNull().default('#94a3b8'),
  is_terminal: integer('is_terminal').notNull().default(0),
  is_default_new: integer('is_default_new').notNull().default(0),
  created_at: integer('created_at').notNull(),
})

export const cvs = sqliteTable('cvs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  file_path: text('file_path').notNull(),
  original_filename: text('original_filename'),
  mime_type: text('mime_type'),
  extracted_text: text('extracted_text'),
  is_default: integer('is_default').notNull().default(0),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const applications = sqliteTable(
  'applications',
  {
    id: text('id').primaryKey(),
    company_id: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role_title: text('role_title').notNull(),
    job_description: text('job_description'),
    job_url: text('job_url'),
    source: text('source').$type<ApplicationSource>().notNull().default('manual'),
    cv_id: text('cv_id').references(() => cvs.id, { onDelete: 'set null' }),
    current_status_id: text('current_status_id')
      .notNull()
      .references(() => statuses.id),
    applied_at: integer('applied_at'),
    last_activity_at: integer('last_activity_at'),
    page_markdown: text('page_markdown'),
    archived: integer('archived').notNull().default(0),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (t) => [
    index('applications_company_id_idx').on(t.company_id),
    index('applications_status_id_idx').on(t.current_status_id),
    index('applications_last_activity_idx').on(t.last_activity_at),
  ]
)

export const application_status_history = sqliteTable(
  'application_status_history',
  {
    id: text('id').primaryKey(),
    application_id: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    status_id: text('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'restrict' }),
    changed_at: integer('changed_at').notNull(),
    source: text('source').$type<StatusHistorySource>().notNull().default('manual'),
    note: text('note'),
  },
  (t) => [index('history_application_id_idx').on(t.application_id)]
)

export const cover_letters = sqliteTable('cover_letters', {
  id: text('id').primaryKey(),
  application_id: text('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  cv_id: text('cv_id').references(() => cvs.id, { onDelete: 'set null' }),
  custom_instructions: text('custom_instructions'),
  generated_content: text('generated_content').notNull(),
  model_used: text('model_used').notNull(),
  generation_time_ms: integer('generation_time_ms'),
  is_edited: integer('is_edited').notNull().default(0),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const emails = sqliteTable(
  'emails',
  {
    id: text('id').primaryKey(),
    gmail_message_id: text('gmail_message_id').notNull().unique(),
    gmail_thread_id: text('gmail_thread_id'),
    subject: text('subject'),
    from_address: text('from_address'),
    from_name: text('from_name'),
    received_at: integer('received_at'),
    body_snippet: text('body_snippet'),
    classification: text('classification').$type<EmailClassification | null>(),
    confidence: real('confidence'),
    suggested_status_id: text('suggested_status_id').references(() => statuses.id),
    linked_application_id: text('linked_application_id').references(() => applications.id),
    linked_company_id: text('linked_company_id').references(() => companies.id),
    user_action: text('user_action').$type<EmailUserAction>().notNull().default('pending'),
    raw_llm_output: text('raw_llm_output'),
    processed_at: integer('processed_at').notNull(),
  },
  (t) => [
    index('emails_linked_application_idx').on(t.linked_application_id),
    index('emails_user_action_idx').on(t.user_action),
    index('emails_received_at_idx').on(t.received_at),
  ]
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at').notNull(),
})
