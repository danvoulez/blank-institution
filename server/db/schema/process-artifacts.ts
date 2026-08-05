import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { processes } from "./processes";
import { processAssignments } from "./process-assignments";

export const processArtifacts = sqliteTable("process_artifacts", {
  id: text("id").primaryKey(),
  processId: text("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  assignmentId: text("assignment_id").references(() => processAssignments.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  inlineText: text("inline_text"),
  externalUri: text("external_uri"),
  digest: text("digest").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, table => [
  index("process_artifacts_process_created_idx").on(table.processId, table.createdAt),
  // Scoped to the assignment, not the process: a later correction round may
  // legitimately produce identical content, and that is a new artifact.
  uniqueIndex("process_artifacts_assignment_digest_uq").on(table.processId, table.assignmentId, table.digest),
]);
