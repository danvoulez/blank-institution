import { and, asc, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "@nuxthub/db";
import type { ProcessArtifact } from "#shared/types/process";
import { canonicalJson } from "#shared/canonical";
import { artifactRow } from "./process-codec";

// The digest addresses the whole artifact, not just its body. Hashing the text
// alone gave two artifacts with the same content but different names or media
// types the same address, which the uniqueness constraint would then read as a
// duplicate.
function digestFor(input: {
  name: string;
  mimeType: string;
  inlineText?: string;
  externalUri?: string;
}) {
  const canonical = canonicalJson({
    name: input.name,
    mimeType: input.mimeType,
    inlineText: input.inlineText,
    externalUri: input.externalUri,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function storeProcessArtifact(input: {
  userId: string;
  processId: string;
  assignmentId?: string;
  name: string;
  mimeType: string;
  inlineText?: string;
  externalUri?: string;
}): Promise<ProcessArtifact> {
  const [process] = await db.select({ id: schema.processes.id }).from(schema.processes).where(and(
    eq(schema.processes.id, input.processId),
    eq(schema.processes.userId, input.userId),
  )).limit(1);
  if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });

  if (input.assignmentId) {
    const [assignment] = await db.select({ id: schema.processAssignments.id }).from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.assignmentId),
      eq(schema.processAssignments.processId, input.processId),
    )).limit(1);
    if (!assignment) throw createError({ statusCode: 404, statusMessage: "Assignment not found" });
  }

  const digest = digestFor(input);
  // A step interrupted mid-execution re-runs, so an Executor can call
  // store_artifact twice for one logical artifact. Storing is idempotent: the
  // second call resolves to the row the first one wrote. The read comes first
  // because SQLite treats NULLs as distinct in a unique index, so the
  // constraint alone does not cover artifacts stored without an assignment.
  const stored = await findArtifact(input.processId, input.assignmentId, digest);
  if (stored) return artifactRow(stored);

  await db.insert(schema.processArtifacts).values({
    id: crypto.randomUUID(),
    processId: input.processId,
    assignmentId: input.assignmentId,
    name: input.name,
    mimeType: input.mimeType,
    inlineText: input.inlineText,
    externalUri: input.externalUri,
    digest,
  }).onConflictDoNothing();

  const row = await findArtifact(input.processId, input.assignmentId, digest);
  if (!row) throw createError({ statusCode: 500, statusMessage: "Failed to store artifact" });
  return artifactRow(row);
}

async function findArtifact(processId: string, assignmentId: string | undefined, digest: string) {
  const [row] = await db.select().from(schema.processArtifacts).where(and(
    eq(schema.processArtifacts.processId, processId),
    assignmentId
      ? eq(schema.processArtifacts.assignmentId, assignmentId)
      : isNull(schema.processArtifacts.assignmentId),
    eq(schema.processArtifacts.digest, digest),
  )).orderBy(asc(schema.processArtifacts.createdAt)).limit(1);
  return row;
}
