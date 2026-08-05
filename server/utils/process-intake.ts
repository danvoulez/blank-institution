import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { IntakeSource, ProcessIntake } from "#shared/types/process";
import { intakeRow } from "./process-codec";

export async function submitIntake(input: {
  principalId: string;
  source: IntakeSource;
  rawRequest: string;
  idempotencyKey: string;
  requestedSkillId?: string;
  threadId?: string;
}): Promise<{ intake: ProcessIntake; created: boolean }> {
  const existing = await getIntakeByKey(input.principalId, input.idempotencyKey);
  if (existing) return { intake: existing, created: false };

  const id = crypto.randomUUID();
  await db.insert(schema.processIntakes).values({
    id,
    principalId: input.principalId,
    source: input.source,
    rawRequest: input.rawRequest,
    idempotencyKey: input.idempotencyKey,
    requestedSkillId: input.requestedSkillId,
    threadId: input.threadId,
    analysisAttempts: 1,
    lastAttemptAt: new Date(),
  }).onConflictDoNothing();

  const created = await getIntakeByKey(input.principalId, input.idempotencyKey);
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: "Failed to persist process intake" });
  }
  return { intake: created, created: created.id === id };
}

export async function getIntakeByKey(principalId: string, idempotencyKey: string) {
  const [row] = await db.select().from(schema.processIntakes).where(and(
    eq(schema.processIntakes.principalId, principalId),
    eq(schema.processIntakes.idempotencyKey, idempotencyKey),
  )).limit(1);
  return row ? intakeRow(row) : undefined;
}

export async function getIntakeForUser(principalId: string, id: string) {
  const [row] = await db.select().from(schema.processIntakes).where(and(
    eq(schema.processIntakes.principalId, principalId),
    eq(schema.processIntakes.id, id),
  )).limit(1);
  return row ? intakeRow(row) : undefined;
}

export async function getIntakeById(id: string) {
  const [row] = await db.select().from(schema.processIntakes).where(eq(schema.processIntakes.id, id)).limit(1);
  return row ? intakeRow(row) : undefined;
}

export async function markIntakeTranslating(id: string, sessionId?: string) {
  await db.update(schema.processIntakes).set({
    status: "translating",
    rootSessionId: sessionId,
    updatedAt: new Date(),
  }).where(and(
    eq(schema.processIntakes.id, id),
    eq(schema.processIntakes.status, "received"),
  ));
}

export async function saveTranslatedIntake(input: {
  intakeId: string;
  normalizedRequest: string;
  suggestedSkillId?: string;
  sessionId?: string;
}) {
  const result = await db.update(schema.processIntakes).set({
    normalizedRequest: input.normalizedRequest,
    requestedSkillId: input.suggestedSkillId,
    status: "analyzing",
    ...(input.sessionId ? { rootSessionId: input.sessionId } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(schema.processIntakes.id, input.intakeId),
    inArray(schema.processIntakes.status, ["received", "translating"]),
  ));
  if (result.rowsAffected === 0) {
    const intake = await getIntakeById(input.intakeId);
    if (!intake || !["analyzing", "converted"].includes(intake.status)) {
      throw createError({ statusCode: 409, statusMessage: "Intake is not awaiting translation" });
    }
  }
  return getIntakeById(input.intakeId);
}

export async function failIntake(id: string, reason: string) {
  await db.update(schema.processIntakes).set({
    status: "failed",
    failureReason: reason,
    updatedAt: new Date(),
  }).where(eq(schema.processIntakes.id, id));
}

export async function listFailedIntakesForUser(principalId: string, limit = 50) {
  const rows = await db.select().from(schema.processIntakes).where(and(
    eq(schema.processIntakes.principalId, principalId),
    eq(schema.processIntakes.status, "failed"),
  )).orderBy(desc(schema.processIntakes.updatedAt)).limit(limit);
  return rows.map(intakeRow);
}

export async function prepareIntakeRetry(input: { id: string; principalId?: string; allowFailed?: boolean }) {
  const conditions = [eq(schema.processIntakes.id, input.id)];
  if (input.principalId) conditions.push(eq(schema.processIntakes.principalId, input.principalId));
  const [row] = await db.select().from(schema.processIntakes).where(and(...conditions)).limit(1);
  if (!row) return undefined;
  const retryable = input.allowFailed
    ? ["received", "translating", "analyzing", "failed"].includes(row.status)
    : ["received", "translating", "analyzing"].includes(row.status);
  if (!retryable) return undefined;
  const updated = await db.update(schema.processIntakes).set({
    status: "received",
    failureReason: null,
    analysisAttempts: row.analysisAttempts + 1,
    lastAttemptAt: new Date(),
    updatedAt: new Date(),
  }).where(and(...conditions, eq(schema.processIntakes.status, row.status)));
  if (updated.rowsAffected === 0) return undefined;
  return getIntakeById(row.id);
}
