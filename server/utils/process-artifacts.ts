import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "@nuxthub/db";
import type { ProcessArtifact } from "#shared/types/process";
import { artifactRow } from "./process-codec";

function digestFor(input: { inlineText?: string; externalUri?: string }) {
  return createHash("sha256").update(input.inlineText ?? input.externalUri ?? "").digest("hex");
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

  const id = crypto.randomUUID();
  await db.insert(schema.processArtifacts).values({
    id,
    processId: input.processId,
    assignmentId: input.assignmentId,
    name: input.name,
    mimeType: input.mimeType,
    inlineText: input.inlineText,
    externalUri: input.externalUri,
    digest: digestFor(input),
  });
  const [row] = await db.select().from(schema.processArtifacts).where(eq(schema.processArtifacts.id, id)).limit(1);
  if (!row) throw createError({ statusCode: 500, statusMessage: "Failed to store artifact" });
  return artifactRow(row);
}
