import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export const processIntakes = sqliteTable("process_intakes", {
  id: text("id").primaryKey(),
  principalId: text("principal_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  source: text("source", { enum: ["api", "mcp", "web", "slack", "imessage"] }).notNull(),
  rawRequest: text("raw_request").notNull(),
  normalizedRequest: text("normalized_request"),
  requestedSkillId: text("requested_skill_id"),
  threadId: text("thread_id"),
  rootSessionId: text("root_session_id"),
  continuationToken: text("continuation_token"),
  status: text("status", { enum: ["received", "translating", "analyzing", "converted", "failed"] }).notNull().default("received"),
  processId: text("process_id"),
  failureReason: text("failure_reason"),
  analysisAttempts: integer("analysis_attempts").notNull().default(1),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).$onUpdate(() => new Date()).notNull(),
}, table => [
  uniqueIndex("process_intakes_principal_key_uq").on(table.principalId, table.idempotencyKey),
  index("process_intakes_status_updated_idx").on(table.status, table.updatedAt),
  index("process_intakes_thread_idx").on(table.threadId),
]);
