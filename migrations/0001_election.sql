CREATE TABLE `election_snapshots` (
	`hash` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`generated_at` text NOT NULL,
	`saved_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `election_state` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`last_attempt` integer DEFAULT 0 NOT NULL,
	`last_success` integer DEFAULT 0 NOT NULL,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
