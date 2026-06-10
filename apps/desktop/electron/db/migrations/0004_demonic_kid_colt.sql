ALTER TABLE `applications` ADD `salary_min` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `salary_max` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `salary_currency` text DEFAULT 'USD';
