import type {
  ActorRef,
  ProcessArtifact,
  ProcessAssignment,
  ProcessCheckpoint,
  ProcessIntake,
  ProcessRecord,
} from "#shared/types/process";
import { schema } from "@nuxthub/db";

export function intakeRow(row: typeof schema.processIntakes.$inferSelect): ProcessIntake {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    source: row.source,
    principalId: row.principalId,
    rawRequest: row.rawRequest,
    normalizedRequest: row.normalizedRequest ?? undefined,
    requestedSkillId: row.requestedSkillId ?? undefined,
    threadId: row.threadId ?? undefined,
    rootSessionId: row.rootSessionId ?? undefined,
    continuationToken: row.continuationToken ?? undefined,
    status: row.status,
    processId: row.processId ?? undefined,
    failureReason: row.failureReason ?? undefined,
    analysisAttempts: row.analysisAttempts,
    lastAttemptAt: row.lastAttemptAt.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function processRow(row: typeof schema.processes.$inferSelect): ProcessRecord {
  return {
    id: row.id,
    intakeId: row.intakeId,
    userId: row.userId,
    rootSessionId: row.rootSessionId ?? undefined,
    continuationToken: row.continuationToken ?? undefined,
    threadId: row.threadId ?? undefined,
    ingress: row.ingress,
    skillId: row.skillId,
    skillVersion: row.skillVersion,
    typeOwner: row.typeOwner as ActorRef,
    currentResponsible: row.currentResponsible as ActorRef,
    objective: row.objective as ProcessRecord["objective"],
    deadline: { class: row.deadlineClass, dueAt: row.dueAt.getTime() },
    status: row.status,
    currentCheckpointSeq: row.currentCheckpointSeq,
    revision: row.revision,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    completedAt: row.completedAt?.getTime(),
  };
}

export function checkpointRow(row: typeof schema.processCheckpoints.$inferSelect): ProcessCheckpoint {
  return {
    id: row.id,
    processId: row.processId,
    sequence: row.sequence,
    kind: row.kind,
    status: row.status,
    reviewer: row.reviewer as ActorRef,
    receivedFrom: (row.receivedFrom as ActorRef | null) ?? undefined,
    decision: row.decision ?? undefined,
    nextResponsible: (row.nextResponsible as ActorRef | null) ?? undefined,
    workOrder: (row.workOrder as ProcessCheckpoint["workOrder"] | null) ?? undefined,
    review: (row.review as ProcessCheckpoint["review"] | null) ?? undefined,
    payload: row.payload ?? undefined,
    result: row.result ?? undefined,
    expectedRevision: row.expectedRevision,
    sourceEventId: row.sourceEventId ?? undefined,
    createdAt: row.createdAt.getTime(),
  };
}

export function assignmentRow(row: typeof schema.processAssignments.$inferSelect): ProcessAssignment {
  return {
    id: row.id,
    processId: row.processId,
    checkpointId: row.checkpointId,
    purpose: row.purpose,
    assignee: row.assignee as ActorRef,
    status: row.status,
    attempt: row.attempt,
    childSessionId: row.childSessionId ?? undefined,
    continuationToken: row.continuationToken ?? undefined,
    sandboxId: row.sandboxId ?? undefined,
    feedback: row.feedback ?? undefined,
    acceptDeadlineAt: row.acceptDeadlineAt.getTime(),
    leaseExpiresAt: row.leaseExpiresAt?.getTime(),
    issuedAt: row.issuedAt.getTime(),
    acceptedAt: row.acceptedAt?.getTime(),
    submittedAt: row.submittedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
  };
}

export function artifactRow(row: typeof schema.processArtifacts.$inferSelect): ProcessArtifact {
  return {
    id: row.id,
    processId: row.processId,
    assignmentId: row.assignmentId ?? undefined,
    name: row.name,
    mimeType: row.mimeType,
    inlineText: row.inlineText ?? undefined,
    externalUri: row.externalUri ?? undefined,
    digest: row.digest,
    createdAt: row.createdAt.getTime(),
  };
}
