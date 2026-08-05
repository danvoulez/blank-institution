import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { processes } from "./processes";
import { processCheckpoints } from "./process-checkpoints";

export const processAssignments = sqliteTable("process_assignments", {
  id: text("id").primaryKey(),
  processId: text("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  checkpointId: text("checkpoint_id").notNull().references(() => processCheckpoints.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["work", "checkpoint_review"] }).notNull().default("work"),
  assignee: text("assignee", { mode: "json" }).notNull(),
  status: text("status", { enum: ["attempting", "accepted", "running", "submitted", "declined", "timed_out", "revoked", "failed"] }).notNull().default("attempting"),
  attempt: integer("attempt").notNull().default(1),
  childSessionId: text("child_session_id"),
  continuationToken: text("continuation_token"),
  sandboxId: text("sandbox_id"),
  feedback: text("feedback"),
  acceptDeadlineAt: integer("accept_deadline_at", { mode: "timestamp_ms" }).notNull(),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  issuedAt: integer("issued_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, table => [
  index("process_assignments_accept_idx").on(table.status, table.acceptDeadlineAt),
  index("process_assignments_lease_idx").on(table.status, table.leaseExpiresAt),
  index("process_assignments_checkpoint_idx").on(table.checkpointId, table.issuedAt),
  index("process_assignments_process_status_idx").on(table.processId, table.status),
  index("process_assignments_child_session_idx").on(table.childSessionId),
]);
