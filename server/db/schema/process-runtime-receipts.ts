import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const processRuntimeReceipts = sqliteTable("process_runtime_receipts", {
  eventId: text("event_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  effectKey: text("effect_key"),
  payload: text("payload", { mode: "json" }),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, table => [
  index("process_runtime_receipts_session_idx").on(table.sessionId, table.processedAt),
  uniqueIndex("process_runtime_receipts_effect_uq").on(table.effectKey),
]);
