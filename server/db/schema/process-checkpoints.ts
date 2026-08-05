import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { processes } from "./processes";

export const processCheckpoints = sqliteTable("process_checkpoints", {
  id: text("id").primaryKey(),
  processId: text("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  kind: text("kind", { enum: ["opening", "review", "closure", "deadline", "recovery"] }).notNull(),
  status: text("status", { enum: ["pending", "applied"] }).notNull().default("applied"),
  reviewer: text("reviewer", { mode: "json" }).notNull(),
  receivedFrom: text("received_from", { mode: "json" }),
  decision: text("decision", { enum: ["assign", "accept", "return", "reassign", "escalate", "complete", "cancel", "fail"] }),
  nextResponsible: text("next_responsible", { mode: "json" }),
  workOrder: text("work_order", { mode: "json" }),
  review: text("review", { mode: "json" }),
  payload: text("payload", { mode: "json" }),
  result: text("result", { mode: "json" }),
  expectedRevision: integer("expected_revision").notNull(),
  sourceEventId: text("source_event_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, table => [
  uniqueIndex("process_checkpoints_process_sequence_uq").on(table.processId, table.sequence),
  uniqueIndex("process_checkpoints_source_event_uq").on(table.sourceEventId),
  index("process_checkpoints_process_created_idx").on(table.processId, table.createdAt),
]);
