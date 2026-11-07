CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`external_session_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`mode` text,
	`log_path` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_contribution` ON `agent_sessions` (`contribution_id`);--> statement-breakpoint
CREATE TABLE `contribution_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contribution_id` text NOT NULL,
	`stage` text NOT NULL,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`message` text,
	`payload` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_contribution` ON `contribution_events` (`contribution_id`,`id`);--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`issue_number` integer,
	`issue_title` text,
	`stage` text DEFAULT 'DISCOVER' NOT NULL,
	`agent_id` text,
	`worktree_path` text,
	`branch_name` text,
	`pr_number` integer,
	`pr_url` text,
	`paused_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contributions_stage` ON `contributions` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_contributions_repo` ON `contributions` (`repo_owner`,`repo_name`);--> statement-breakpoint
CREATE TABLE `key_value` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`number` integer,
	`url` text,
	`title` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pull_requests_contribution` ON `pull_requests` (`contribution_id`);--> statement-breakpoint
CREATE TABLE `review_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`report` text,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_reports_contribution` ON `review_reports` (`contribution_id`);--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`command` text NOT NULL,
	`exit_code` integer NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`output` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_test_results_contribution` ON `test_results` (`contribution_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`repo_url` text NOT NULL,
	`worktree_path` text NOT NULL,
	`branch_name` text NOT NULL,
	`base_branch` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`dirty` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspaces_contribution` ON `workspaces` (`contribution_id`);