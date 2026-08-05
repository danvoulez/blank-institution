import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { NextAction, RuntimeFact } from "#shared/types/process";
import { canonicalJson } from "#shared/canonical";
import { effectKeyInput } from "#shared/effect-key";
import { executeNextAction } from "./eve-control-plane";
import { openRecoveryCheckpoint } from "./process-recovery";

function effectKey(fact: RuntimeFact) {
  return createHash("sha256").update(canonicalJson(effectKeyInput(fact)), "utf8").digest("hex");
}

export async function ingestRuntimeFact(fact: RuntimeFact) {
  const key = effectKey(fact);
  const inserted = await db.insert(schema.processRuntimeReceipts).values({
    eventId: fact.eventId,
    sessionId: fact.sessionId,
    eventType: fact.eventType,
    effectKey: key,
    payload: fact,
  }).onConflictDoNothing().returning({ eventId: schema.processRuntimeReceipts.eventId });
  if (inserted.length === 0) return { duplicate: true };

  if (fact.eventType === "session.waiting") {
    const token = readContinuationToken(fact.data);
    if (token) await persistContinuation(fact.sessionId, token);
    return { duplicate: false, waiting: true };
  }

  if (fact.eventType === "turn.failed" || fact.eventType === "session.failed") {
    const recovery = await markSessionFailure(fact);
    if (recovery?.nextAction) await executeNextAction(recovery.nextAction);
    return { duplicate: false, failed: true, recovery };
  }

  return { duplicate: false };
}

function readContinuationToken(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>).continuationToken;
  return typeof value === "string" ? value : undefined;
}

async function persistContinuation(sessionId: string, token: string) {
  await Promise.all([
    db.update(schema.processIntakes).set({ continuationToken: token, updatedAt: new Date() }).where(eq(schema.processIntakes.rootSessionId, sessionId)),
    db.update(schema.processes).set({ continuationToken: token, updatedAt: new Date() }).where(eq(schema.processes.rootSessionId, sessionId)),
    db.update(schema.processAssignments).set({ continuationToken: token }).where(eq(schema.processAssignments.childSessionId, sessionId)),
  ]);
}

async function markSessionFailure(fact: RuntimeFact): Promise<{ processId: string; nextAction: NextAction } | undefined> {
  const [assignment] = await db.select({ id: schema.processAssignments.id }).from(schema.processAssignments).where(and(
    eq(schema.processAssignments.childSessionId, fact.sessionId),
    inArray(schema.processAssignments.status, ["attempting", "accepted", "running"]),
  )).limit(1);
  if (!assignment) return undefined;

  return openRecoveryCheckpoint({
    assignmentId: assignment.id,
    reason: `Runtime ${fact.eventType} in session ${fact.sessionId}: ${JSON.stringify(fact.data ?? {})}`,
    correction: "Decide whether to retry, reassign, cancel, or fail the process.",
    sourceEventId: fact.eventId,
    payload: { runtimeFact: fact },
  });
}
