import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { ActorRef, NextAction, RuntimeFact, WorkOrder } from "#shared/types/process";
import { executeNextAction } from "./eve-control-plane";

function effectKey(fact: RuntimeFact) {
  const coordinates = [fact.sessionId, fact.eventType, fact.turnId, fact.stepIndex, fact.sequence, fact.callId]
    .filter(value => value !== undefined)
    .join(":");
  return coordinates || `${fact.sessionId}:${fact.eventId}`;
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
  const [assignment] = await db.select().from(schema.processAssignments).where(and(
    eq(schema.processAssignments.childSessionId, fact.sessionId),
    inArray(schema.processAssignments.status, ["attempting", "accepted", "running"]),
  )).limit(1);
  if (!assignment) return undefined;

  const recovery = await db.transaction(async (tx) => {
    const [process] = await tx.select().from(schema.processes).where(eq(schema.processes.id, assignment.processId)).limit(1);
    if (!process || ["completed", "cancelled", "failed"].includes(process.status)) return undefined;
    const [sourceCheckpoint] = await tx.select().from(schema.processCheckpoints).where(
      eq(schema.processCheckpoints.id, assignment.checkpointId),
    ).limit(1);

    await tx.update(schema.processAssignments).set({
      status: "failed",
      leaseExpiresAt: null,
      sandboxId: null,
      feedback: `Runtime ${fact.eventType}: ${JSON.stringify(fact.data ?? {})}`,
    }).where(and(
      eq(schema.processAssignments.id, assignment.id),
      inArray(schema.processAssignments.status, ["attempting", "accepted", "running"]),
    ));

    const sequence = process.currentCheckpointSeq + 1;
    const checkpointId = crypto.randomUUID();
    const reviewAssignmentId = crypto.randomUUID();
    const owner = process.typeOwner as ActorRef;
    await tx.insert(schema.processCheckpoints).values({
      id: checkpointId,
      processId: process.id,
      sequence,
      kind: "recovery",
      status: "pending",
      reviewer: owner,
      receivedFrom: assignment.assignee,
      decision: null,
      nextResponsible: owner,
      workOrder: (sourceCheckpoint?.workOrder as WorkOrder | null) ?? undefined,
      payload: {
        failedAssignmentId: assignment.id,
        failedAssignmentPurpose: assignment.purpose,
        runtimeFact: fact,
      },
      review: {
        accepted: false,
        findings: [`Runtime failure in session ${fact.sessionId}`],
        requestedCorrections: ["Decide whether to retry, reassign, cancel, or fail the process."],
      },
      result: fact.data,
      expectedRevision: process.revision,
      sourceEventId: fact.eventId,
    });
    await tx.insert(schema.processAssignments).values({
      id: reviewAssignmentId,
      processId: process.id,
      checkpointId,
      purpose: "checkpoint_review",
      assignee: owner,
      status: "attempting",
      attempt: 1,
      acceptDeadlineAt: new Date(Date.now() + Number(process.env.ASSIGNMENT_ACCEPT_MINUTES ?? 10) * 60_000),
    });
    await tx.update(schema.processes).set({
      status: "blocked",
      currentCheckpointSeq: sequence,
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
    return { processId: process.id, userId: process.userId, owner, reviewAssignmentId };
  });

  if (!recovery) return undefined;
  const nextAction: NextAction = recovery.owner.kind === "human"
    ? {
        kind: "request_human",
        processId: recovery.processId,
        assignmentId: recovery.reviewAssignmentId,
        userId: recovery.owner.id,
        prompt: "A runtime failure created a recovery checkpoint. Accept it and decide whether to retry, reassign, cancel, or fail.",
      }
    : {
        kind: "launch_role",
        role: "supervisor",
        userId: recovery.userId,
        processId: recovery.processId,
        assignmentId: recovery.reviewAssignmentId,
        message: [
          `Accept recovery checkpoint assignment ${recovery.reviewAssignmentId} for process ${recovery.processId}.`,
          "Inspect the failed assignment and dossier, then call recover_process with an explicit decision.",
        ].join("\n\n"),
      };
  return { processId: recovery.processId, nextAction };
}
