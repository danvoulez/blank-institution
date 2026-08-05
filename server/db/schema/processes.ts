import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { processIntakes } from "./process-intakes";

export const processes = sqliteTable("processes", {
  id: text("id").primaryKey(),
  intakeId: text("intake_id").notNull().references(() => processIntakes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  rootSessionId: text("root_session_id"),
  continuationToken: text("continuation_token"),
  threadId: text("thread_id"),
  ingress: text("ingress", { enum: ["api", "mcp", "web", "slack", "imessage"] }).notNull(),
  skillId: text("skill_id").notNull(),
  skillVersion: text("skill_version").notNull(),
  typeOwner: text("type_owner", { mode: "json" }).notNull(),
  currentResponsible: text("current_responsible", { mode: "json" }).notNull(),
  objective: text("objective", { mode: "json" }).notNull(),
  deadlineClass: text("deadline_class", { enum: ["urgent", "24h", "1w", "1m"] }).notNull(),
  dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["open", "assigning", "running", "checkpoint", "waiting_human", "blocked", "completed", "cancelled", "failed"] }).notNull().default("open"),
  currentCheckpointSeq: integer("current_checkpoint_seq").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).$onUpdate(() => new Date()).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, table => [
  index("processes_user_updated_idx").on(table.userId, table.updatedAt),
  index("processes_status_due_idx").on(table.status, table.dueAt),
  index("processes_intake_idx").on(table.intakeId),
  index("processes_root_session_idx").on(table.rootSessionId),
]);
