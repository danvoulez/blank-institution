import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// One row per named piece of work that must not run twice at once. The
// metabolism tick is driven by an external timer, and a timer that fires while
// the previous run is still going — or a manual trigger landing on top of a
// scheduled one — would otherwise reissue the same assignments twice.
export const institutionLeases = sqliteTable("institution_leases", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  acquiredAt: integer("acquired_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
