CREATE TABLE `application_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`status_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`status_id`) REFERENCES `statuses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `history_application_id_idx` ON `application_status_history` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`role_title` text NOT NULL,
	`job_description` text,
	`job_url` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`cv_id` text,
	`current_status_id` text NOT NULL,
	`applied_at` integer,
	`last_activity_at` integer,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cv_id`) REFERENCES `cvs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`current_status_id`) REFERENCES `statuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `applications_company_id_idx` ON `applications` (`company_id`);--> statement-breakpoint
CREATE INDEX `applications_status_id_idx` ON `applications` (`current_status_id`);--> statement-breakpoint
CREATE INDEX `applications_last_activity_idx` ON `applications` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`careers_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_lower_idx` ON `companies` (lower("name"));--> statement-breakpoint
CREATE TABLE `cover_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`cv_id` text,
	`custom_instructions` text,
	`generated_content` text NOT NULL,
	`model_used` text NOT NULL,
	`generation_time_ms` integer,
	`is_edited` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cv_id`) REFERENCES `cvs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `cvs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`file_path` text NOT NULL,
	`original_filename` text,
	`mime_type` text,
	`extracted_text` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`gmail_message_id` text NOT NULL,
	`gmail_thread_id` text,
	`subject` text,
	`from_address` text,
	`from_name` text,
	`received_at` integer,
	`body_snippet` text,
	`classification` text,
	`confidence` real,
	`suggested_status_id` text,
	`linked_application_id` text,
	`linked_company_id` text,
	`user_action` text DEFAULT 'pending' NOT NULL,
	`raw_llm_output` text,
	`processed_at` integer NOT NULL,
	FOREIGN KEY (`suggested_status_id`) REFERENCES `statuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emails_gmail_message_id_unique` ON `emails` (`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `emails_linked_application_idx` ON `emails` (`linked_application_id`);--> statement-breakpoint
CREATE INDEX `emails_user_action_idx` ON `emails` (`user_action`);--> statement-breakpoint
CREATE INDEX `emails_received_at_idx` ON `emails` (`received_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL,
	`color` text DEFAULT '#94a3b8' NOT NULL,
	`is_terminal` integer DEFAULT 0 NOT NULL,
	`is_default_new` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statuses_name_unique` ON `statuses` (`name`);