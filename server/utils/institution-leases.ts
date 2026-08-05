import { and, eq, lt, or } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";

// A lease is taken in one statement so two callers racing for it cannot both
// win: the insert either creates the row or takes it over, and the takeover
// only applies where the previous holder has already expired.
export async function acquireLease(input: {
  name: string;
  holder: string;
  ttlMs: number;
}): Promise<{ acquired: boolean; expiresAt: number }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs);

  const result = await db.insert(schema.institutionLeases).values({
    name: input.name,
    holder: input.holder,
    acquiredAt: now,
    expiresAt,
  }).onConflictDoUpdate({
    target: schema.institutionLeases.name,
    set: { holder: input.holder, acquiredAt: now, expiresAt },
    where: lt(schema.institutionLeases.expiresAt, now),
  });

  return { acquired: result.rowsAffected > 0, expiresAt: expiresAt.getTime() };
}

// Releasing is scoped to the holder so a run that overran its lease cannot
// release the lease a later run has already taken.
export async function releaseLease(input: { name: string; holder: string }) {
  await db.delete(schema.institutionLeases).where(and(
    eq(schema.institutionLeases.name, input.name),
    eq(schema.institutionLeases.holder, input.holder),
  ));
}

export async function readLease(name: string) {
  const [row] = await db.select().from(schema.institutionLeases).where(
    eq(schema.institutionLeases.name, name),
  ).limit(1);
  if (!row) return undefined;
  return {
    name: row.name,
    holder: row.holder,
    acquiredAt: row.acquiredAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

export async function pruneExpiredLeases(now = new Date()) {
  await db.delete(schema.institutionLeases).where(or(
    lt(schema.institutionLeases.expiresAt, now),
  ));
}
