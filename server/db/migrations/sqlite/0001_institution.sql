CREATE TABLE `process_intakes` (
  `id` text PRIMARY KEY NOT NULL,
  `principal_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `idempotency_key` text NOT NULL,
  `source` text NOT NULL,
  `raw_request` text NOT NULL,
  `normalized_request` text,
  `requested_skill_id` text,
  `thread_id` text,
  `root_session_id` text,
  `continuation_token` text,
  `status` text DEFAULT 'received' NOT NULL,
  `process_id` text,
  `failure_reason` text,
  `analysis_attempts` integer DEFAULT 1 NOT NULL,
  `last_attempt_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX `process_intakes_principal_key_uq` ON `process_intakes` (`principal_id`,`idempotency_key`);
CREATE INDEX `process_intakes_status_updated_idx` ON `process_intakes` (`status`,`updated_at`);
CREATE INDEX `process_intakes_thread_idx` ON `process_intakes` (`thread_id`);

CREATE TABLE `processes` (
  `id` text PRIMARY KEY NOT NULL,
  `intake_id` text NOT NULL REFERENCES `process_intakes`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `root_session_id` text,
  `continuation_token` text,
  `thread_id` text,
  `ingress` text NOT NULL,
  `skill_id` text NOT NULL,
  `skill_version` text NOT NULL,
  `type_owner` text NOT NULL,
  `current_responsible` text NOT NULL,
  `objective` text NOT NULL,
  `deadline_class` text NOT NULL,
  `due_at` integer NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `current_checkpoint_seq` integer DEFAULT 0 NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `completed_at` integer
);
CREATE INDEX `processes_user_updated_idx` ON `processes` (`user_id`,`updated_at`);
CREATE INDEX `processes_status_due_idx` ON `processes` (`status`,`due_at`);
CREATE INDEX `processes_intake_idx` ON `processes` (`intake_id`);
CREATE INDEX `processes_root_session_idx` ON `processes` (`root_session_id`);

CREATE TABLE `process_checkpoints` (
  `id` text PRIMARY KEY NOT NULL,
  `process_id` text NOT NULL REFERENCES `processes`(`id`) ON DELETE cascade,
  `sequence` integer NOT NULL,
  `kind` text NOT NULL,
  `status` text DEFAULT 'applied' NOT NULL,
  `reviewer` text NOT NULL,
  `received_from` text,
  `decision` text,
  `next_responsible` text,
  `work_order` text,
  `review` text,
  `payload` text,
  `result` text,
  `expected_revision` integer NOT NULL,
  `source_event_id` text,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX `process_checkpoints_process_sequence_uq` ON `process_checkpoints` (`process_id`,`sequence`);
CREATE UNIQUE INDEX `process_checkpoints_source_event_uq` ON `process_checkpoints` (`source_event_id`);
CREATE INDEX `process_checkpoints_process_created_idx` ON `process_checkpoints` (`process_id`,`created_at`);

CREATE TABLE `process_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `process_id` text NOT NULL REFERENCES `processes`(`id`) ON DELETE cascade,
  `checkpoint_id` text NOT NULL REFERENCES `process_checkpoints`(`id`) ON DELETE cascade,
  `purpose` text DEFAULT 'work' NOT NULL,
  `assignee` text NOT NULL,
  `status` text DEFAULT 'attempting' NOT NULL,
  `attempt` integer DEFAULT 1 NOT NULL,
  `child_session_id` text,
  `continuation_token` text,
  `sandbox_id` text,
  `feedback` text,
  `accept_deadline_at` integer NOT NULL,
  `lease_expires_at` integer,
  `issued_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `accepted_at` integer,
  `submitted_at` integer,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX `process_assignments_accept_idx` ON `process_assignments` (`status`,`accept_deadline_at`);
CREATE INDEX `process_assignments_lease_idx` ON `process_assignments` (`status`,`lease_expires_at`);
CREATE INDEX `process_assignments_checkpoint_idx` ON `process_assignments` (`checkpoint_id`,`issued_at`);
CREATE INDEX `process_assignments_process_status_idx` ON `process_assignments` (`process_id`,`status`);
CREATE INDEX `process_assignments_child_session_idx` ON `process_assignments` (`child_session_id`);

CREATE TABLE `process_artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `process_id` text NOT NULL REFERENCES `processes`(`id`) ON DELETE cascade,
  `assignment_id` text REFERENCES `process_assignments`(`id`) ON DELETE set null,
  `name` text NOT NULL,
  `mime_type` text NOT NULL,
  `inline_text` text,
  `external_uri` text,
  `digest` text NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX `process_artifacts_process_created_idx` ON `process_artifacts` (`process_id`,`created_at`);

CREATE TABLE `process_api_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `name` text NOT NULL,
  `token_prefix` text NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  `last_used_at` integer,
  `revoked_at` integer
);
CREATE UNIQUE INDEX `process_api_tokens_hash_uq` ON `process_api_tokens` (`token_hash`);
CREATE INDEX `process_api_tokens_user_idx` ON `process_api_tokens` (`user_id`,`created_at`);
CREATE INDEX `process_api_tokens_prefix_idx` ON `process_api_tokens` (`token_prefix`);

CREATE TABLE `process_runtime_receipts` (
  `event_id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `event_type` text NOT NULL,
  `effect_key` text,
  `payload` text,
  `processed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX `process_runtime_receipts_session_idx` ON `process_runtime_receipts` (`session_id`,`processed_at`);
CREATE UNIQUE INDEX `process_runtime_receipts_effect_uq` ON `process_runtime_receipts` (`effect_key`);

CREATE TABLE `process_role_models` (
  `role` text PRIMARY KEY NOT NULL,
  `model` text NOT NULL,
  `mode` text NOT NULL,
  `base_url` text,
  `context_window_tokens` integer,
  `updated_by` text,
  `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
