import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type {
  ActorRef,
  NextAction,
  ProcessDetail,
  ProcessRecord,
  ProcessRecoveryDecision,
  ProcessSummary,
  ProcessTypeManifest,
  SupervisorOpeningDecision,
  SupervisorReviewDecision,
  WorkOrder,
  WorkSubmission,
} from "#shared/types/process";
import { assignmentRow, artifactRow, checkpointRow, intakeRow, processRow } from "./process-codec";
import { resolveDeadline } from "./process-deadlines";
import { nextProcessStatus } from "./process-status";
import { getProcessType, validateDeadlineClass, validateResponsible, validateTypeOwner } from "./process-types";

const ACTIVE_ASSIGNMENT_STATUSES = ["attempting", "accepted", "running"] as const;

function acceptMinutes() {
  const value = Number(process.env.ASSIGNMENT_ACCEPT_MINUTES ?? 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function leaseMinutes() {
  const value = Number(process.env.ASSIGNMENT_LEASE_MINUTES ?? 30);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

function llm(role: "translator" | "supervisor" | "executor" | "metabolism"): ActorRef {
  return { kind: "llm", role, id: `institution:${role}` };
}

function canonicalActor(actor: ActorRef, userId: string): ActorRef {
  if (actor.kind === "human") return { kind: "human", id: userId, displayName: actor.displayName };
  return llm(actor.role);
}

function sameActor(left: unknown, right: ActorRef) {
  if (!left || typeof left !== "object") return false;
  const actor = left as ActorRef;
  if (actor.kind !== right.kind || actor.id !== right.id) return false;
  return actor.kind === "human" || (right.kind === "llm" && actor.role === right.role);
}

function assignmentAction(input: {
  processId: string;
  assignmentId: string;
  assignee: ActorRef;
  userId: string;
  workOrder: WorkOrder;
  skillId: string;
}): NextAction {
  if (input.assignee.kind === "human") {
    return {
      kind: "request_human",
      processId: input.processId,
      assignmentId: input.assignmentId,
      userId: input.assignee.id,
      prompt: `${input.workOrder.objective}\n\nAcceptance criteria:\n${input.workOrder.acceptanceCriteria.map(item => `- ${item}`).join("\n")}`,
    };
  }
  return {
    kind: "launch_role",
    role: "executor",
    userId: input.userId,
    processId: input.processId,
    assignmentId: input.assignmentId,
    message: [
      `Execute assignment ${input.assignmentId} for process ${input.processId}.`,
      `Load the ${input.skillId} Process Skill before working.`,
      `Objective: ${input.workOrder.objective}`,
      `Acceptance criteria:\n${input.workOrder.acceptanceCriteria.map(item => `- ${item}`).join("\n")}`,
      input.workOrder.requiredCapabilities.length
        ? `Required capabilities: ${input.workOrder.requiredCapabilities.join(", ")}`
        : "Use only the capabilities required by the work.",
      "Required protocol: accept the assignment, perform the work using Eve's built-in sandbox/file tools, store relevant artifacts, then submit_work.",
    ].join("\n\n"),
  };
}

// Names the stage on a work order as it enters the dossier, so the review that
// follows reads the stage from the record rather than inferring it.
function withStage(manifest: ProcessTypeManifest, workOrder: WorkOrder): WorkOrder {
  if (workOrder.stageId || manifest.stages.length !== 1) return workOrder;
  return { ...workOrder, stageId: manifest.stages[0]!.id };
}

// Which stage's review policy governs this checkpoint. The union of every
// stage's allowedDecisions let a decision permitted only in a later stage be
// applied in an earlier one — inert while every installed skill has a single
// stage, wrong the moment one does not.
function resolveStage(manifest: ProcessTypeManifest, stageId: string | undefined) {
  if (stageId) {
    const stage = manifest.stages.find(item => item.id === stageId);
    if (!stage) {
      throw createError({ statusCode: 422, statusMessage: `Stage ${stageId} is not part of ${manifest.id}` });
    }
    return stage;
  }

  const [only] = manifest.stages;
  if (!only || manifest.stages.length > 1) {
    throw createError({
      statusCode: 422,
      statusMessage: `${manifest.id} has multiple stages, so its work order must name a stageId`,
    });
  }
  return only;
}

async function activeAssignmentForProcess(processId: string) {
  const [row] = await db.select().from(schema.processAssignments).where(and(
    eq(schema.processAssignments.processId, processId),
    inArray(schema.processAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
  )).orderBy(desc(schema.processAssignments.createdAt)).limit(1);
  return row ? assignmentRow(row) : undefined;
}

export async function getProcessForUser(userId: string, id: string) {
  const [row] = await db.select().from(schema.processes).where(and(
    eq(schema.processes.id, id),
    eq(schema.processes.userId, userId),
  )).limit(1);
  return row ? processRow(row) : undefined;
}

export async function getProcessById(id: string) {
  const [row] = await db.select().from(schema.processes).where(eq(schema.processes.id, id)).limit(1);
  return row ? processRow(row) : undefined;
}



export async function getLatestActiveProcessForUser(userId: string, ingress?: ProcessRecord["ingress"]) {
  const conditions = [
    eq(schema.processes.userId, userId),
    inArray(schema.processes.status, ["open", "assigning", "running", "checkpoint", "waiting_human", "blocked"]),
  ];
  if (ingress) conditions.push(eq(schema.processes.ingress, ingress));
  const [row] = await db.select().from(schema.processes).where(and(...conditions)).orderBy(desc(schema.processes.updatedAt)).limit(1);
  return row ? processRow(row) : undefined;
}

export async function getProcessSummaryForThread(userId: string, threadId: string): Promise<ProcessSummary | undefined> {
  const [row] = await db.select().from(schema.processes).where(and(
    eq(schema.processes.userId, userId),
    eq(schema.processes.threadId, threadId),
  )).orderBy(desc(schema.processes.createdAt)).limit(1);
  if (!row) return undefined;
  const process = processRow(row);
  return {
    id: process.id,
    skillId: process.skillId,
    skillName: getProcessType(process.skillId, process.skillVersion).name,
    status: process.status,
    objective: process.objective,
    currentResponsible: process.currentResponsible,
    deadline: process.deadline,
    updatedAt: process.updatedAt,
  };
}

export async function getProcessDetailForUser(userId: string, id: string): Promise<ProcessDetail | undefined> {
  const process = await getProcessForUser(userId, id);
  if (!process) return undefined;
  const [intakeRows, checkpointRows, assignmentRows, artifactRows] = await Promise.all([
    db.select().from(schema.processIntakes).where(eq(schema.processIntakes.id, process.intakeId)).limit(1),
    db.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.processId, id)).orderBy(asc(schema.processCheckpoints.sequence)),
    db.select().from(schema.processAssignments).where(eq(schema.processAssignments.processId, id)).orderBy(asc(schema.processAssignments.createdAt)),
    db.select().from(schema.processArtifacts).where(eq(schema.processArtifacts.processId, id)).orderBy(asc(schema.processArtifacts.createdAt)),
  ]);
  const intake = intakeRows[0];
  if (!intake) throw createError({ statusCode: 500, statusMessage: "Process intake is missing" });
  return {
    process,
    intake: intakeRow(intake),
    checkpoints: checkpointRows.map(checkpointRow),
    assignments: assignmentRows.map(assignmentRow),
    artifacts: artifactRows.map(artifactRow),
    type: getProcessType(process.skillId, process.skillVersion),
  };
}

export async function listProcessesForUser(input: {
  userId: string;
  status?: ProcessSummary["status"];
  skillId?: string;
  limit: number;
}): Promise<ProcessSummary[]> {
  const conditions = [eq(schema.processes.userId, input.userId)];
  if (input.status) conditions.push(eq(schema.processes.status, input.status));
  if (input.skillId) conditions.push(eq(schema.processes.skillId, input.skillId));
  const rows = await db.select().from(schema.processes).where(and(...conditions)).orderBy(desc(schema.processes.updatedAt)).limit(input.limit);
  return rows.map((row) => {
    const process = processRow(row);
    return {
      id: process.id,
      skillId: process.skillId,
      skillName: getProcessType(process.skillId, process.skillVersion).name,
      status: process.status,
      objective: process.objective,
      currentResponsible: process.currentResponsible,
      deadline: process.deadline,
      updatedAt: process.updatedAt,
    };
  });
}

export async function openProcessFromSupervisor(
  userId: string,
  input: SupervisorOpeningDecision,
): Promise<{ detail: ProcessDetail; nextAction: NextAction }> {
  const manifest = getProcessType(input.processType.skillId, input.processType.version);
  const typeOwner = canonicalActor(input.typeOwner, userId);
  const currentResponsible = canonicalActor(input.currentResponsible, userId);
  validateTypeOwner(manifest, typeOwner);
  validateResponsible(manifest, currentResponsible);
  validateDeadlineClass(manifest, input.deadline.class);
  const deadline = resolveDeadline(input.deadline);

  const result = await db.transaction(async (tx) => {
    const [intake] = await tx.select().from(schema.processIntakes).where(and(
      eq(schema.processIntakes.id, input.intakeId),
      eq(schema.processIntakes.principalId, userId),
    )).limit(1);
    if (!intake) throw createError({ statusCode: 404, statusMessage: "Intake not found" });

    if (intake.status === "converted" && intake.processId) {
      return { processId: intake.processId, assignmentId: undefined as string | undefined, replay: true };
    }
    if (!["analyzing", "translating", "received"].includes(intake.status)) {
      throw createError({ statusCode: 409, statusMessage: `Intake cannot be converted from ${intake.status}` });
    }

    const processId = crypto.randomUUID();
    const checkpointId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    const now = Date.now();
    const humanOpeningReview = typeOwner.kind === "human";
    const initialStatus = humanOpeningReview || currentResponsible.kind === "human" ? "waiting_human" : "assigning";

    await tx.insert(schema.processes).values({
      id: processId,
      intakeId: intake.id,
      userId,
      rootSessionId: intake.rootSessionId,
      continuationToken: intake.continuationToken,
      threadId: intake.threadId,
      ingress: intake.source,
      skillId: manifest.id,
      skillVersion: manifest.version,
      typeOwner,
      currentResponsible,
      objective: input.objective,
      deadlineClass: deadline.class,
      dueAt: new Date(deadline.dueAt),
      status: initialStatus,
      currentCheckpointSeq: 1,
      revision: 1,
    });
    await tx.insert(schema.processCheckpoints).values({
      id: checkpointId,
      processId,
      sequence: 1,
      kind: "opening",
      status: humanOpeningReview ? "pending" : "applied",
      reviewer: typeOwner,
      decision: humanOpeningReview ? null : "assign",
      nextResponsible: currentResponsible,
      workOrder: withStage(manifest, input.workOrder),
      payload: { rationale: input.rationale },
      expectedRevision: 0,
    });
    await tx.insert(schema.processAssignments).values({
      id: assignmentId,
      processId,
      checkpointId,
      purpose: humanOpeningReview ? "checkpoint_review" : "work",
      assignee: humanOpeningReview ? typeOwner : currentResponsible,
      status: "attempting",
      attempt: 1,
      acceptDeadlineAt: new Date(now + acceptMinutes() * 60_000),
    });
    await tx.update(schema.processIntakes).set({
      status: "converted",
      processId,
      requestedSkillId: manifest.id,
      updatedAt: new Date(),
    }).where(eq(schema.processIntakes.id, intake.id));

    return { processId, assignmentId, replay: false, humanOpeningReview };
  });

  const detail = await getProcessDetailForUser(userId, result.processId);
  if (!detail) throw createError({ statusCode: 500, statusMessage: "Opened process could not be loaded" });
  if (result.replay || !result.assignmentId) return { detail, nextAction: { kind: "none" } };
  if (result.humanOpeningReview) {
    return {
      detail,
      nextAction: {
        kind: "request_human",
        processId: detail.process.id,
        assignmentId: result.assignmentId,
        userId,
        prompt: "Review and confirm the opening checkpoint: process type, owner, current responsible, concrete objective, acceptance criteria, and deadline. Work will not begin before this decision.",
      },
    };
  }
  return {
    detail,
    nextAction: assignmentAction({
      processId: detail.process.id,
      assignmentId: result.assignmentId,
      assignee: detail.process.currentResponsible,
      userId,
      workOrder: input.workOrder,
      skillId: detail.process.skillId,
    }),
  };
}

export async function acceptAssignment(input: {
  userId: string;
  assignmentId: string;
  actor: ActorRef;
  sessionId?: string;
  leaseMinutes?: number;
}) {
  const [assignment] = await db.select().from(schema.processAssignments).where(eq(schema.processAssignments.id, input.assignmentId)).limit(1);
  if (!assignment) throw createError({ statusCode: 404, statusMessage: "Assignment not found" });
  const process = await getProcessForUser(input.userId, assignment.processId);
  if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
  if (!sameActor(assignment.assignee, input.actor)) {
    throw createError({ statusCode: 403, statusMessage: "Assignment belongs to another responsible" });
  }

  // Resolved before the claim, not after: a stale assignment on a closed
  // process must be refused outright rather than accepted and then rejected,
  // which would leave the assignment claimed against a process it cannot move.
  const claimedStatus = nextProcessStatus(
    process.status,
    assignment.purpose === "work"
      ? "running"
      : input.actor.kind === "human" ? "waiting_human" : "checkpoint",
  );

  const now = new Date();
  const lease = new Date(now.getTime() + (input.leaseMinutes ?? leaseMinutes()) * 60_000);
  const result = await db.update(schema.processAssignments).set({
    status: "accepted",
    acceptedAt: now,
    leaseExpiresAt: lease,
    childSessionId: input.sessionId,
  }).where(and(
    eq(schema.processAssignments.id, input.assignmentId),
    eq(schema.processAssignments.status, "attempting"),
  ));
  if (result.rowsAffected === 0) {
    const current = await activeAssignmentForProcess(process.id);
    if (current?.id !== input.assignmentId || !["accepted", "running"].includes(current.status)) {
      throw createError({ statusCode: 409, statusMessage: "Assignment was already claimed or is no longer active" });
    }
  }
  await db.update(schema.processes).set({
    status: claimedStatus,
    updatedAt: new Date(),
  }).where(eq(schema.processes.id, process.id));
  return { assignmentId: input.assignmentId, purpose: assignment.purpose, leaseExpiresAt: lease.getTime() };
}

export async function heartbeatAssignment(input: { userId: string; assignmentId: string; leaseMinutes?: number }) {
  const [assignment] = await db.select().from(schema.processAssignments).where(eq(schema.processAssignments.id, input.assignmentId)).limit(1);
  if (!assignment) throw createError({ statusCode: 404, statusMessage: "Assignment not found" });
  const process = await getProcessForUser(input.userId, assignment.processId);
  if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
  const lease = new Date(Date.now() + (input.leaseMinutes ?? leaseMinutes()) * 60_000);
  const result = await db.update(schema.processAssignments).set({ leaseExpiresAt: lease, status: "running" }).where(and(
    eq(schema.processAssignments.id, input.assignmentId),
    inArray(schema.processAssignments.status, ["accepted", "running"]),
  ));
  if (result.rowsAffected === 0) throw createError({ statusCode: 409, statusMessage: "Assignment is not running" });
  return { leaseExpiresAt: lease.getTime() };
}

export async function applyOpeningCheckpointDecision(input: {
  userId: string;
  checkpointId: string;
  assignmentId: string;
  reviewer: ActorRef;
  expectedRevision: number;
  decision: "accept" | "reassign" | "cancel" | "fail";
  feedback?: string;
  typeOwner?: ActorRef;
  currentResponsible?: ActorRef;
  objective?: SupervisorOpeningDecision["objective"];
  deadline?: SupervisorOpeningDecision["deadline"];
  workOrder?: WorkOrder;
}): Promise<{ detail: ProcessDetail; nextAction: NextAction }> {
  const outcome = await db.transaction(async (tx) => {
    const [checkpoint] = await tx.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.id, input.checkpointId)).limit(1);
    if (!checkpoint || checkpoint.kind !== "opening" || checkpoint.status !== "pending") {
      throw createError({ statusCode: 409, statusMessage: "Opening checkpoint is not pending" });
    }
    const [process] = await tx.select().from(schema.processes).where(and(
      eq(schema.processes.id, checkpoint.processId),
      eq(schema.processes.userId, input.userId),
    )).limit(1);
    if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
    if (process.revision !== input.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: "Process changed; reload before deciding" });
    }
    if (!sameActor(checkpoint.reviewer, input.reviewer)) {
      throw createError({ statusCode: 403, statusMessage: "Only the opening checkpoint owner may decide" });
    }
    const [reviewAssignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.assignmentId),
      eq(schema.processAssignments.checkpointId, checkpoint.id),
      eq(schema.processAssignments.purpose, "checkpoint_review"),
    )).limit(1);
    if (!reviewAssignment || reviewAssignment.status !== "accepted") {
      throw createError({ statusCode: 409, statusMessage: "Accept the opening review assignment before deciding" });
    }
    if (!sameActor(reviewAssignment.assignee, input.reviewer)) {
      throw createError({ statusCode: 403, statusMessage: "Opening review assignment belongs to another owner" });
    }

    if (input.decision === "cancel" || input.decision === "fail") {
      const terminalStatus = input.decision === "cancel" ? "cancelled" : "failed";
      await tx.update(schema.processCheckpoints).set({
        status: "applied",
        decision: input.decision,
        review: {
          accepted: false,
          findings: input.feedback ? [input.feedback] : [],
          requestedCorrections: [],
        },
      }).where(eq(schema.processCheckpoints.id, checkpoint.id));
      await tx.update(schema.processAssignments).set({
        status: "submitted",
        submittedAt: new Date(),
        leaseExpiresAt: null,
      }).where(eq(schema.processAssignments.id, reviewAssignment.id));
      await tx.update(schema.processes).set({
        status: nextProcessStatus(process.status, terminalStatus),
        revision: process.revision + 1,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
      return { processId: process.id, terminalStatus, assignmentId: undefined as string | undefined, responsible: undefined as ActorRef | undefined, workOrder: undefined as WorkOrder | undefined };
    }

    const manifest = getProcessType(process.skillId, process.skillVersion);
    const typeOwner = canonicalActor(input.typeOwner ?? (process.typeOwner as ActorRef), input.userId);
    const responsible = canonicalActor(
      input.currentResponsible ?? (checkpoint.nextResponsible as ActorRef) ?? (process.currentResponsible as ActorRef),
      input.userId,
    );
    validateTypeOwner(manifest, typeOwner);
    validateResponsible(manifest, responsible);
    const objective = input.objective ?? (process.objective as SupervisorOpeningDecision["objective"]);
    const deadline = input.deadline
      ? resolveDeadline(input.deadline)
      : { class: process.deadlineClass, dueAt: process.dueAt.getTime() };
    validateDeadlineClass(manifest, deadline.class);
    const workOrder = input.workOrder ?? (checkpoint.workOrder as WorkOrder | null) ?? {
      objective: objective.deliverable,
      acceptanceCriteria: objective.acceptanceCriteria,
      requiredCapabilities: [],
    };
    const assignmentId = crypto.randomUUID();

    await tx.update(schema.processCheckpoints).set({
      status: "applied",
      decision: "assign",
      reviewer: typeOwner,
      nextResponsible: responsible,
      workOrder,
      review: {
        accepted: true,
        findings: input.feedback ? [input.feedback] : [],
        requestedCorrections: [],
      },
    }).where(eq(schema.processCheckpoints.id, checkpoint.id));
    await tx.update(schema.processAssignments).set({
      status: "submitted",
      submittedAt: new Date(),
      leaseExpiresAt: null,
    }).where(eq(schema.processAssignments.id, reviewAssignment.id));
    await tx.insert(schema.processAssignments).values({
      id: assignmentId,
      processId: process.id,
      checkpointId: checkpoint.id,
      purpose: "work",
      assignee: responsible,
      status: "attempting",
      attempt: 1,
      acceptDeadlineAt: new Date(Date.now() + acceptMinutes() * 60_000),
    });
    await tx.update(schema.processes).set({
      typeOwner,
      currentResponsible: responsible,
      objective,
      deadlineClass: deadline.class,
      dueAt: new Date(deadline.dueAt),
      status: nextProcessStatus(process.status, responsible.kind === "human" ? "waiting_human" : "assigning"),
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
    return { processId: process.id, terminalStatus: undefined, assignmentId, responsible, workOrder };
  });

  const detail = await getProcessDetailForUser(input.userId, outcome.processId);
  if (!detail) throw createError({ statusCode: 500, statusMessage: "Opening decision process could not be loaded" });
  if (outcome.terminalStatus) return { detail, nextAction: { kind: "park", processId: detail.process.id, reason: outcome.terminalStatus } };
  if (!outcome.assignmentId || !outcome.responsible || !outcome.workOrder) return { detail, nextAction: { kind: "none" } };
  return {
    detail,
    nextAction: assignmentAction({
      processId: detail.process.id,
      assignmentId: outcome.assignmentId,
      assignee: outcome.responsible,
      userId: input.userId,
      workOrder: outcome.workOrder,
      skillId: detail.process.skillId,
    }),
  };
}

export async function applyRecoveryDecision(input: {
  userId: string;
  reviewer: ActorRef;
  reviewAssignmentId: string;
  decision: ProcessRecoveryDecision;
}): Promise<{ detail: ProcessDetail; nextAction: NextAction }> {
  const outcome = await db.transaction(async (tx) => {
    const [reviewAssignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.reviewAssignmentId),
      eq(schema.processAssignments.purpose, "checkpoint_review"),
    )).limit(1);
    if (!reviewAssignment || reviewAssignment.status !== "accepted") {
      throw createError({ statusCode: 409, statusMessage: "Accept the recovery checkpoint assignment before deciding" });
    }
    if (!sameActor(reviewAssignment.assignee, input.reviewer)) {
      throw createError({ statusCode: 403, statusMessage: "Recovery assignment belongs to another owner" });
    }
    const [checkpoint] = await tx.select().from(schema.processCheckpoints).where(and(
      eq(schema.processCheckpoints.id, reviewAssignment.checkpointId),
      eq(schema.processCheckpoints.kind, "recovery"),
      eq(schema.processCheckpoints.status, "pending"),
    )).limit(1);
    if (!checkpoint) throw createError({ statusCode: 409, statusMessage: "Recovery checkpoint is not pending" });
    const [process] = await tx.select().from(schema.processes).where(and(
      eq(schema.processes.id, checkpoint.processId),
      eq(schema.processes.userId, input.userId),
    )).limit(1);
    if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
    if (input.decision.processId !== process.id || process.revision !== input.decision.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: "Process changed; reload before deciding" });
    }
    if (!sameActor(process.typeOwner, input.reviewer)) {
      throw createError({ statusCode: 403, statusMessage: "Only the type owner may decide recovery" });
    }
    const payload = checkpoint.payload && typeof checkpoint.payload === "object"
      ? checkpoint.payload as Record<string, unknown>
      : {};
    const failedAssignmentId = typeof payload.failedAssignmentId === "string" ? payload.failedAssignmentId : undefined;
    if (!failedAssignmentId) throw createError({ statusCode: 409, statusMessage: "Recovery checkpoint is missing the failed assignment" });
    const [failedAssignment] = await tx.select().from(schema.processAssignments).where(eq(schema.processAssignments.id, failedAssignmentId)).limit(1);
    if (!failedAssignment) throw createError({ statusCode: 404, statusMessage: "Failed assignment not found" });

    const terminalStatus = input.decision.decision === "cancel"
      ? "cancelled" as const
      : input.decision.decision === "fail"
        ? "failed" as const
        : undefined;
    let nextAssignee: ActorRef | undefined;
    let workOrder = input.decision.workOrder ?? (checkpoint.workOrder as WorkOrder | null) ?? undefined;
    let targetCheckpointId = checkpoint.id;

    if (!terminalStatus) {
      if (failedAssignment.purpose === "checkpoint_review") {
        if (input.decision.decision !== "return") {
          throw createError({ statusCode: 422, statusMessage: "A failed checkpoint review can only be retried, cancelled, or failed" });
        }
        nextAssignee = process.typeOwner as ActorRef;
        targetCheckpointId = failedAssignment.checkpointId;
      } else {
        nextAssignee = input.decision.decision === "return"
          ? failedAssignment.assignee as ActorRef
          : input.decision.nextResponsible
            ? canonicalActor(input.decision.nextResponsible, input.userId)
            : undefined;
        if (!nextAssignee) throw createError({ statusCode: 422, statusMessage: "Reassignment requires nextResponsible" });
        const manifest = getProcessType(process.skillId, process.skillVersion);
        validateResponsible(manifest, nextAssignee);
        const [sourceCheckpoint] = await tx.select().from(schema.processCheckpoints).where(
          eq(schema.processCheckpoints.id, failedAssignment.checkpointId),
        ).limit(1);
        workOrder = input.decision.workOrder
          ?? (sourceCheckpoint?.workOrder as WorkOrder | null)
          ?? workOrder;
        if (!workOrder) throw createError({ statusCode: 422, statusMessage: "Recovery of work requires a work order" });
      }
    }

    await tx.update(schema.processCheckpoints).set({
      status: "applied",
      decision: input.decision.decision,
      nextResponsible: nextAssignee,
      workOrder,
      review: {
        accepted: false,
        findings: [input.decision.feedback],
        requestedCorrections: terminalStatus ? [] : [input.decision.feedback],
      },
    }).where(eq(schema.processCheckpoints.id, checkpoint.id));
    await tx.update(schema.processAssignments).set({
      status: "submitted",
      submittedAt: new Date(),
      leaseExpiresAt: null,
    }).where(eq(schema.processAssignments.id, reviewAssignment.id));

    if (terminalStatus) {
      await tx.update(schema.processes).set({
        status: nextProcessStatus(process.status, terminalStatus),
        revision: process.revision + 1,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
      return { terminalStatus, newAssignmentId: undefined as string | undefined, purpose: undefined, assignee: undefined as ActorRef | undefined, targetCheckpointId: undefined as string | undefined };
    }

    const newAssignmentId = crypto.randomUUID();
    await tx.insert(schema.processAssignments).values({
      id: newAssignmentId,
      processId: process.id,
      checkpointId: targetCheckpointId,
      purpose: failedAssignment.purpose,
      assignee: nextAssignee!,
      status: "attempting",
      attempt: failedAssignment.attempt + 1,
      feedback: input.decision.feedback,
      acceptDeadlineAt: new Date(Date.now() + acceptMinutes() * 60_000),
    });
    const isHuman = nextAssignee!.kind === "human";
    const nextStatus = isHuman
      ? "waiting_human"
      : failedAssignment.purpose === "checkpoint_review"
        ? "checkpoint"
        : "assigning";
    await tx.update(schema.processes).set({
      status: nextProcessStatus(process.status, nextStatus),
      ...(failedAssignment.purpose === "work" ? { currentResponsible: nextAssignee } : {}),
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
    return { terminalStatus: undefined, newAssignmentId, purpose: failedAssignment.purpose, assignee: nextAssignee, targetCheckpointId };
  });

  const detail = await getProcessDetailForUser(input.userId, input.decision.processId);
  if (!detail) throw createError({ statusCode: 500, statusMessage: "Recovered process could not be loaded" });
  if (outcome.terminalStatus) return { detail, nextAction: { kind: "park", processId: detail.process.id, reason: outcome.terminalStatus } };
  if (!outcome.newAssignmentId || !outcome.assignee || !outcome.purpose || !outcome.targetCheckpointId) return { detail, nextAction: { kind: "none" } };

  if (outcome.purpose === "work") {
    const checkpoint = detail.checkpoints.find(item => item.id === outcome.targetCheckpointId);
    if (!checkpoint?.workOrder) throw createError({ statusCode: 500, statusMessage: "Recovery work order is missing" });
    return {
      detail,
      nextAction: assignmentAction({
        processId: detail.process.id,
        assignmentId: outcome.newAssignmentId,
        assignee: outcome.assignee,
        userId: input.userId,
        workOrder: checkpoint.workOrder,
        skillId: detail.process.skillId,
      }),
    };
  }

  const target = detail.checkpoints.find(item => item.id === outcome.targetCheckpointId);
  const prompt = target?.kind === "opening"
    ? "The opening checkpoint review was interrupted. Accept the reissued review assignment and confirm or correct the opening checkpoint."
    : target?.kind === "recovery"
      ? "The recovery checkpoint review was interrupted. Accept the reissued assignment and decide recovery."
      : "The checkpoint review was interrupted. Accept the reissued assignment and review the submitted work.";
  return {
    detail,
    nextAction: outcome.assignee.kind === "human"
      ? { kind: "request_human", processId: detail.process.id, assignmentId: outcome.newAssignmentId, userId: outcome.assignee.id, prompt }
      : {
          kind: "launch_role",
          role: "supervisor",
          userId: input.userId,
          processId: detail.process.id,
          assignmentId: outcome.newAssignmentId,
          message: [
            `Accept checkpoint-review assignment ${outcome.newAssignmentId}.`,
            prompt,
            target?.kind === "recovery" ? "Call recover_process." : "Call review_process after inspecting the dossier.",
          ].join("\n\n"),
        },
  };
}

export async function submitWork(
  userId: string,
  input: WorkSubmission,
): Promise<{ detail: ProcessDetail; nextAction: NextAction }> {
  const submissionOutcome = await db.transaction(async (tx) => {
    const [assignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.assignmentId),
      eq(schema.processAssignments.processId, input.processId),
    )).limit(1);
    if (!assignment) throw createError({ statusCode: 404, statusMessage: "Assignment not found" });
    const [process] = await tx.select().from(schema.processes).where(and(
      eq(schema.processes.id, input.processId),
      eq(schema.processes.userId, userId),
    )).limit(1);
    if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
    if (input.artifactIds.length > 0) {
      const uniqueArtifactIds = [...new Set(input.artifactIds)];
      const artifacts = await tx.select({
        id: schema.processArtifacts.id,
        assignmentId: schema.processArtifacts.assignmentId,
      }).from(schema.processArtifacts).where(and(
        eq(schema.processArtifacts.processId, input.processId),
        inArray(schema.processArtifacts.id, uniqueArtifactIds),
      ));
      if (artifacts.length !== uniqueArtifactIds.length || artifacts.some(artifact => artifact.assignmentId && artifact.assignmentId !== input.assignmentId)) {
        throw createError({ statusCode: 422, statusMessage: "Every submitted artifact must belong to this process and assignment" });
      }
    }
    if (assignment.purpose !== "work") {
      throw createError({ statusCode: 409, statusMessage: "Checkpoint-review assignments are completed through a checkpoint decision" });
    }
    if (assignment.status === "submitted") {
      const [existingReview] = await tx.select().from(schema.processAssignments).where(and(
        eq(schema.processAssignments.processId, process.id),
        eq(schema.processAssignments.checkpointId, assignment.checkpointId),
        eq(schema.processAssignments.purpose, "checkpoint_review"),
        inArray(schema.processAssignments.status, ["attempting", "accepted"]),
      )).orderBy(desc(schema.processAssignments.createdAt)).limit(1);
      return { reviewAssignmentId: existingReview?.id };
    }
    if (!["accepted", "running"].includes(assignment.status)) {
      throw createError({ statusCode: 409, statusMessage: `Cannot submit assignment from ${assignment.status}` });
    }
    await tx.update(schema.processAssignments).set({
      status: "submitted",
      submittedAt: new Date(),
      leaseExpiresAt: null,
      sandboxId: null,
      feedback: JSON.stringify({
        summary: input.summary,
        result: input.result,
        artifactIds: input.artifactIds,
        limitations: input.limitations,
        recommendedNextAction: input.recommendedNextAction,
      }),
    }).where(eq(schema.processAssignments.id, input.assignmentId));
    const owner = process.typeOwner as ActorRef;
    const reviewAssignmentId = crypto.randomUUID();
    await tx.insert(schema.processAssignments).values({
      id: reviewAssignmentId,
      processId: process.id,
      checkpointId: assignment.checkpointId,
      purpose: "checkpoint_review",
      assignee: owner,
      status: "attempting",
      attempt: 1,
      acceptDeadlineAt: new Date(Date.now() + acceptMinutes() * 60_000),
    });
    await tx.update(schema.processes).set({
      status: nextProcessStatus(process.status, owner.kind === "human" ? "waiting_human" : "checkpoint"),
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(
      eq(schema.processes.id, input.processId),
      eq(schema.processes.revision, process.revision),
    ));
    return { reviewAssignmentId };
  });

  const detail = await getProcessDetailForUser(userId, input.processId);
  if (!detail) throw createError({ statusCode: 500, statusMessage: "Submitted process could not be loaded" });
  const owner = detail.process.typeOwner;
  if (!submissionOutcome.reviewAssignmentId) {
    return { detail, nextAction: { kind: "none" } };
  }
  return {
    detail,
    nextAction: owner.kind === "human"
      ? {
          kind: "request_human",
          processId: input.processId,
          assignmentId: submissionOutcome.reviewAssignmentId,
          userId: owner.id,
          prompt: `Review the submitted work for ${detail.process.objective.deliverable} against the recorded acceptance criteria.`,
        }
      : {
          kind: "launch_role",
          role: "supervisor",
          userId,
          processId: input.processId,
          assignmentId: submissionOutcome.reviewAssignmentId,
          message: [
            `Accept checkpoint-review assignment ${submissionOutcome.reviewAssignmentId} before deciding.`,
            `Review submitted assignment ${input.assignmentId} for process ${input.processId}.`,
            `Load the ${detail.process.skillId} Process Skill.`,
            "Use get_process_context, inspect the dossier and acceptance criteria, then call review_process with one explicit decision.",
          ].join("\n\n"),
        },
  };
}

export async function applyReviewDecision(input: {
  userId: string;
  reviewer: ActorRef;
  decision: SupervisorReviewDecision;
  reviewAssignmentId: string;
}): Promise<{ detail: ProcessDetail; nextAction: NextAction }> {
  const outcome = await db.transaction(async (tx) => {
    const [process] = await tx.select().from(schema.processes).where(and(
      eq(schema.processes.id, input.decision.processId),
      eq(schema.processes.userId, input.userId),
    )).limit(1);
    if (!process) throw createError({ statusCode: 404, statusMessage: "Process not found" });
    if (process.revision !== input.decision.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: "Process changed; reload before deciding" });
    }
    if (!sameActor(process.typeOwner, input.reviewer)) {
      throw createError({ statusCode: 403, statusMessage: "Only the current type owner may decide this checkpoint" });
    }
    const [assignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.decision.assignmentId),
      eq(schema.processAssignments.processId, process.id),
    )).limit(1);
    if (!assignment || assignment.purpose !== "work" || assignment.status !== "submitted") {
      throw createError({ statusCode: 409, statusMessage: "Review requires a submitted work assignment" });
    }

    const [reviewAssignment] = await tx.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.id, input.reviewAssignmentId),
      eq(schema.processAssignments.processId, process.id),
      eq(schema.processAssignments.purpose, "checkpoint_review"),
    )).limit(1);
    if (!reviewAssignment || reviewAssignment.status !== "accepted" || !sameActor(reviewAssignment.assignee, input.reviewer)) {
      throw createError({ statusCode: 409, statusMessage: "Accept the checkpoint-review assignment before deciding" });
    }
    if (reviewAssignment.checkpointId !== assignment.checkpointId) {
      throw createError({ statusCode: 409, statusMessage: "Checkpoint-review assignment does not belong to the submitted work" });
    }

    const manifest = getProcessType(process.skillId, process.skillVersion);
    const [workCheckpoint] = await tx.select().from(schema.processCheckpoints).where(
      eq(schema.processCheckpoints.id, assignment.checkpointId),
    ).limit(1);
    const stage = resolveStage(manifest, (workCheckpoint?.workOrder as WorkOrder | null)?.stageId);
    if (!stage.review.allowedDecisions.includes(input.decision.decision)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Decision ${input.decision.decision} is not allowed by stage ${stage.id} of ${manifest.id}`,
      });
    }

    const checkpointId = crypto.randomUUID();
    const sequence = process.currentCheckpointSeq + 1;
    const review = {
      accepted: ["accept", "complete"].includes(input.decision.decision),
      findings: input.decision.findings,
      requestedCorrections: input.decision.requestedCorrections,
    };
    let nextResponsible = input.decision.nextResponsible
      ? canonicalActor(input.decision.nextResponsible as ActorRef, input.userId)
      : undefined;
    let workOrder = input.decision.workOrder;
    let terminalStatus: "completed" | "cancelled" | "failed" | undefined;

    if (input.decision.decision === "return") {
      nextResponsible = assignment.assignee as ActorRef;
      const [sourceCheckpoint] = await tx.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.id, assignment.checkpointId)).limit(1);
      workOrder = input.decision.workOrder ?? (sourceCheckpoint?.workOrder as WorkOrder | null) ?? undefined;
    }
    if (["reassign", "escalate"].includes(input.decision.decision) && !nextResponsible) {
      throw createError({ statusCode: 422, statusMessage: "This decision requires nextResponsible" });
    }
    if (["return", "reassign", "escalate"].includes(input.decision.decision) && !workOrder) {
      throw createError({ statusCode: 422, statusMessage: "This decision requires a workOrder" });
    }
    if (input.decision.decision === "complete" || (input.decision.decision === "accept" && !workOrder)) terminalStatus = "completed";
    if (input.decision.decision === "cancel") terminalStatus = "cancelled";
    if (input.decision.decision === "fail") terminalStatus = "failed";

    await tx.insert(schema.processCheckpoints).values({
      id: checkpointId,
      processId: process.id,
      sequence,
      kind: terminalStatus === "completed" ? "closure" : "review",
      reviewer: input.reviewer,
      receivedFrom: assignment.assignee,
      decision: input.decision.decision,
      nextResponsible,
      workOrder,
      review,
      result: assignment.feedback ? JSON.parse(assignment.feedback) : undefined,
      expectedRevision: process.revision,
    });

    await tx.update(schema.processAssignments).set({
      status: "submitted",
      submittedAt: new Date(),
      leaseExpiresAt: null,
    }).where(eq(schema.processAssignments.id, reviewAssignment.id));

    if (terminalStatus) {
      await tx.update(schema.processes).set({
        status: nextProcessStatus(process.status, terminalStatus),
        currentCheckpointSeq: sequence,
        revision: process.revision + 1,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
      return { assignmentId: undefined as string | undefined, terminalStatus, nextResponsible: undefined, workOrder: undefined };
    }

    if (!nextResponsible || !workOrder) {
      throw createError({ statusCode: 422, statusMessage: "Non-terminal decision must create the next assignment" });
    }
    validateResponsible(manifest, nextResponsible);
    const nextAssignmentId = crypto.randomUUID();
    const nextStatus = nextResponsible.kind === "human" ? "waiting_human" : "assigning";
    await tx.insert(schema.processAssignments).values({
      id: nextAssignmentId,
      processId: process.id,
      checkpointId,
      purpose: "work",
      assignee: nextResponsible,
      status: "attempting",
      attempt: assignment.attempt + 1,
      feedback: input.decision.requestedCorrections.join("\n"),
      acceptDeadlineAt: new Date(Date.now() + acceptMinutes() * 60_000),
    });
    await tx.update(schema.processes).set({
      status: nextProcessStatus(process.status, nextStatus),
      currentResponsible: nextResponsible,
      currentCheckpointSeq: sequence,
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, process.id), eq(schema.processes.revision, process.revision)));
    return { assignmentId: nextAssignmentId, terminalStatus: undefined, nextResponsible, workOrder };
  });

  const detail = await getProcessDetailForUser(input.userId, input.decision.processId);
  if (!detail) throw createError({ statusCode: 500, statusMessage: "Reviewed process could not be loaded" });
  if (outcome.terminalStatus === "completed") return { detail, nextAction: { kind: "complete", processId: detail.process.id } };
  if (outcome.terminalStatus) return { detail, nextAction: { kind: "park", processId: detail.process.id, reason: outcome.terminalStatus } };
  if (!outcome.assignmentId || !outcome.nextResponsible || !outcome.workOrder) return { detail, nextAction: { kind: "none" } };
  return {
    detail,
    nextAction: assignmentAction({
      processId: detail.process.id,
      assignmentId: outcome.assignmentId,
      assignee: outcome.nextResponsible,
      userId: input.userId,
      workOrder: outcome.workOrder,
      skillId: detail.process.skillId,
    }),
  };
}

export async function linkRoleSession(input: {
  role: "translator" | "supervisor" | "executor";
  intakeId?: string;
  processId?: string;
  assignmentId?: string;
  sessionId: string;
  continuationToken?: string;
}) {
  // The Translator owns the process/root conversation. Supervisor review
  // sessions are disposable decision workers and must never overwrite it.
  if (input.role === "translator" && input.intakeId) {
    await db.update(schema.processIntakes).set({
      rootSessionId: input.sessionId,
      continuationToken: input.continuationToken,
      updatedAt: new Date(),
    }).where(eq(schema.processIntakes.id, input.intakeId));
  }

  // Only the Executor session owns the work assignment and its sandbox. A
  // later Supervisor review may reference the same assignment but is not its
  // child execution session.
  if ((input.role === "executor" || input.role === "supervisor") && input.assignmentId) {
    await db.update(schema.processAssignments).set({
      childSessionId: input.sessionId,
      continuationToken: input.continuationToken,
    }).where(eq(schema.processAssignments.id, input.assignmentId));
  }
}

export function supervisorActor(): ActorRef {
  return llm("supervisor");
}

export function executorActor(): ActorRef {
  return llm("executor");
}
