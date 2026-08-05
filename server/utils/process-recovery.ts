import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { ActorRef, NextAction, WorkOrder } from "#shared/types/process";
import { nextProcessStatus } from "./process-status";

const TERMINAL = ["completed", "cancelled", "failed"] as const;
const RECOVERABLE = ["attempting", "accepted", "running"] as const;

// Every way an assignment can die without producing work — a runtime failure,
// or a retry budget running out — ends in the same place: the type owner is
// handed an explicit decision and the process stops until they make it. Nothing
// retries an assignment on its own past this point.
export async function openRecoveryCheckpoint(input: {
  assignmentId: string;
  reason: string;
  correction: string;
  sourceEventId?: string;
  payload?: Record<string, unknown>;
}): Promise<{ processId: string; nextAction: NextAction } | undefined> {
  const recovery = await db.transaction(async (tx) => {
    const [assignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.assignmentId),
      inArray(schema.processAssignments.status, [...RECOVERABLE]),
    )).limit(1);
    if (!assignment) return undefined;

    const [process] = await tx.select().from(schema.processes).where(
      eq(schema.processes.id, assignment.processId),
    ).limit(1);
    if (!process || TERMINAL.includes(process.status as (typeof TERMINAL)[number])) return undefined;

    // One pending recovery at a time. Without this a scheduled scan would open
    // a fresh checkpoint on every tick while the owner is still deciding.
    const [pending] = await tx.select({ id: schema.processCheckpoints.id }).from(schema.processCheckpoints).where(and(
      eq(schema.processCheckpoints.processId, process.id),
      eq(schema.processCheckpoints.kind, "recovery"),
      eq(schema.processCheckpoints.status, "pending"),
    )).limit(1);
    if (pending) return undefined;

    const [sourceCheckpoint] = await tx.select().from(schema.processCheckpoints).where(
      eq(schema.processCheckpoints.id, assignment.checkpointId),
    ).limit(1);

    await tx.update(schema.processAssignments).set({
      status: "failed",
      leaseExpiresAt: null,
      sandboxId: null,
      feedback: input.reason,
    }).where(and(
      eq(schema.processAssignments.id, assignment.id),
      inArray(schema.processAssignments.status, [...RECOVERABLE]),
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
        ...input.payload,
      },
      review: {
        accepted: false,
        findings: [input.reason],
        requestedCorrections: [input.correction],
      },
      expectedRevision: process.revision,
      sourceEventId: input.sourceEventId,
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
      status: nextProcessStatus(process.status, "blocked"),
      currentCheckpointSeq: sequence,
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));

    return { processId: process.id, userId: process.userId, owner, reviewAssignmentId };
  });

  if (!recovery) return undefined;

  const prompt = `${input.reason} Accept the recovery checkpoint and decide whether to retry, reassign, cancel, or fail.`;
  return {
    processId: recovery.processId,
    nextAction: recovery.owner.kind === "human"
      ? {
          kind: "request_human",
          processId: recovery.processId,
          assignmentId: recovery.reviewAssignmentId,
          userId: recovery.owner.id,
          prompt,
        }
      : {
          kind: "launch_role",
          role: "supervisor",
          userId: recovery.userId,
          processId: recovery.processId,
          assignmentId: recovery.reviewAssignmentId,
          message: [
            `Accept recovery checkpoint assignment ${recovery.reviewAssignmentId} for process ${recovery.processId}.`,
            input.reason,
            "Inspect the failed assignment and dossier, then call recover_process with an explicit decision.",
          ].join("\n\n"),
        },
  };
}
