import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const processRoleModels = sqliteTable("process_role_models", {
  role: text("role", { enum: ["translator", "supervisor", "executor", "metabolism"] }).primaryKey(),
  model: text("model").notNull(),
  mode: text("mode", { enum: ["gateway", "openai-compatible"] }).notNull(),
  baseUrl: text("base_url"),
  contextWindowTokens: integer("context_window_tokens"),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).$onUpdate(() => new Date()).notNull(),
});
