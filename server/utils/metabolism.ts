import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { ActorRef, MetabolismAction } from "#shared/types/process";
import { createInstitutionEveClient, executeNextAction, launchTranslatorForIntake } from "./eve-control-plane";
import { assignmentRow, intakeRow, processRow } from "./process-codec";
import { getProcessDetailForUser } from "./processes";
import { failIntake, prepareIntakeRetry } from "./process-intake";
import { notifyHumanAssignment, notifyIntakeFailure } from "./process-notifications";
import { openRecoveryCheckpoint } from "./process-recovery";
import { nextProcessStatus } from "./process-status";

const TERMINAL = ["completed", "cancelled", "failed"] as const;

function intakeMaxAttempts() {
  const value = Number(process.env.INTAKE_ANALYSIS_MAX_ATTEMPTS ?? 3);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 3;
}

function assignmentMaxAttempts() {
  const value = Number(process.env.ASSIGNMENT_MAX_ATTEMPTS ?? 3);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 3;
}

function deadlineWarningAt(process: { createdAt: Date; dueAt: Date; deadlineClass: string }) {
  const fraction = process.deadlineClass === "urgent" ? 0.5 : process.deadlineClass === "24h" ? 0.75 : 0.8;
  return process.createdAt.getTime() + Math.max(0, process.dueAt.getTime() - process.createdAt.getTime()) * fraction;
}

export async function scanMetabolism(now = Date.now()) {
  const staleIntakeBefore = new Date(now - 10 * 60_000);
  const staleProcessBefore = now - 10 * 60_000;
  const [intakes, expiredAssignments, activeAssignments, activeProcesses] = await Promise.all([
    db.select().from(schema.processIntakes).where(and(
      inArray(schema.processIntakes.status, ["received", "translating", "analyzing"]),
      lt(schema.processIntakes.updatedAt, staleIntakeBefore),
    )).orderBy(asc(schema.processIntakes.updatedAt)).limit(50),
    db.select().from(schema.processAssignments).where(or(
      and(eq(schema.processAssignments.status, "attempting"), lt(schema.processAssignments.acceptDeadlineAt, new Date(now))),
      and(inArray(schema.processAssignments.status, ["accepted", "running"]), lt(schema.processAssignments.leaseExpiresAt, new Date(now))),
    )).orderBy(asc(schema.processAssignments.createdAt)).limit(100),
    db.select({ processId: schema.processAssignments.processId }).from(schema.processAssignments).where(
      inArray(schema.processAssignments.status, ["attempting", "accepted", "running"]),
    ),
    db.select().from(schema.processes).where(
      inArray(schema.processes.status, ["open", "assigning", "running", "checkpoint", "waiting_human", "blocked"]),
    ).orderBy(asc(schema.processes.dueAt)).limit(300),
  ]);

  const activeProcessIds = new Set(activeAssignments.map(item => item.processId));
  const processes = activeProcesses.filter((process) => {
    const orphaned = process.updatedAt.getTime() <= staleProcessBefore && !activeProcessIds.has(process.id);
    return process.status === "blocked" || now >= deadlineWarningAt(process) || orphaned;
  });

  return {
    generatedAt: now,
    intakes: intakes.map(intakeRow),
    assignments: expiredAssignments.map(assignmentRow),
    processes: processes.map(processRow),
  };
}

export async function applyMetabolismAction(action: MetabolismAction) {
  switch (action.kind) {
    case "retry_intake": {
      const [row] = await db.select().from(schema.processIntakes).where(eq(schema.processIntakes.id, action.intakeId)).limit(1);
      if (!row || row.status === "converted" || row.status === "failed") return { ignored: true };
      if (row.analysisAttempts >= intakeMaxAttempts()) {
        const reason = `Automatic analysis failed after ${row.analysisAttempts} attempt(s). Human review is required.`;
        await failIntake(row.id, reason);
        const attempts = await notifyIntakeFailure({ userId: row.principalId, intakeId: row.id, reason });
        return { failed: true, intakeId: row.id, reason, attempts };
      }
      const intake = await prepareIntakeRetry({ id: row.id });
      if (!intake) return { ignored: true, reason: "intake changed before retry" };
      return launchTranslatorForIntake({ intakeId: intake.id, userId: intake.principalId, rawRequest: intake.rawRequest, requestedSkillId: intake.requestedSkillId });
    }
    case "retry_assignment":
      return retryAssignment(action.assignmentId);
    case "resume_process":
    case "escalate": {
      const [row] = await db.select().from(schema.processes).where(eq(schema.processes.id, action.processId)).limit(1);
      if (!row || TERMINAL.includes(row.status as (typeof TERMINAL)[number])) return { ignored: true };
      const now = Date.now();
      const stale = row.updatedAt.getTime() < now - 10 * 60_000;
      const deadlineWarning = now >= deadlineWarningAt(row);
      if (action.kind === "resume_process" && row.status !== "blocked" && !stale) return { ignored: true, reason: "process is not blocked or stale" };
      if (action.kind === "escalate" && row.status !== "blocked" && !deadlineWarning) return { ignored: true, reason: "process is neither blocked nor at its deadline warning threshold" };
      if (deadlineWarning) await recordDeadlineCheckpoint(row.id, action.reason);
      return dispatchExistingOwnerReview(row.id, action.reason);
    }
    case "remind_human": {
      const [process] = await db.select().from(schema.processes).where(eq(schema.processes.id, action.processId)).limit(1);
      if (!process) return { ignored: true };
      return {
        reminded: true,
        processId: action.processId,
        assignmentId: action.assignmentId,
        attempts: await notifyHumanAssignment({
          userId: process.userId,
          processId: action.processId,
          assignmentId: action.assignmentId,
          prompt: "A human assignment or checkpoint is still waiting for your response.",
        }),
      };
    }
    case "close_orphan_sandbox":
      return resetAssignmentSession(action.assignmentId);
  }
}

async function retryAssignment(assignmentId: string) {
  const [assignment] = await db.select().from(schema.processAssignments).where(eq(schema.processAssignments.id, assignmentId)).limit(1);
  if (!assignment || !["attempting", "accepted", "running", "failed", "timed_out"].includes(assignment.status)) return { ignored: true };
  const now = Date.now();
  if (assignment.status === "attempting" && assignment.acceptDeadlineAt.getTime() > now) return { ignored: true, reason: "accept deadline has not expired" };
  if (["accepted", "running"].includes(assignment.status) && assignment.leaseExpiresAt && assignment.leaseExpiresAt.getTime() > now) return { ignored: true, reason: "lease is still active" };
  const [process] = await db.select().from(schema.processes).where(eq(schema.processes.id, assignment.processId)).limit(1);
  if (!process || TERMINAL.includes(process.status as (typeof TERMINAL)[number])) return { ignored: true };
  const [checkpoint] = await db.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.id, assignment.checkpointId)).limit(1);
  if (!checkpoint?.workOrder) return { ignored: true, reason: "missing work order" };

  // Reissuing is not free: every attempt at an LLM assignee starts a new role
  // session. Past the budget the institution stops guessing and hands the type
  // owner a decision, the same way an exhausted intake escalates to a human.
  if (assignment.attempt >= assignmentMaxAttempts()) {
    const reason = `Assignment ${assignment.id} failed or timed out after ${assignment.attempt} attempt(s).`;
    const recovery = await openRecoveryCheckpoint({
      assignmentId: assignment.id,
      reason,
      correction: "Decide whether to retry with a corrected work order, reassign, cancel, or fail.",
      payload: { exhaustedAssignmentId: assignment.id, attempts: assignment.attempt },
    });
    if (!recovery) return { ignored: true, reason: "recovery is already pending or the process is closed" };
    await executeNextAction(recovery.nextAction);
    return { escalated: true, assignmentId: assignment.id, attempts: assignment.attempt, reason };
  }

  const newId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.update(schema.processAssignments).set({ status: "timed_out", leaseExpiresAt: null }).where(eq(schema.processAssignments.id, assignment.id));
    await tx.insert(schema.processAssignments).values({
      id: newId,
      processId: process.id,
      checkpointId: checkpoint.id,
      purpose: assignment.purpose,
      assignee: assignment.assignee,
      status: "attempting",
      attempt: assignment.attempt + 1,
      feedback: assignment.feedback,
      acceptDeadlineAt: new Date(Date.now() + Number(process.env.ASSIGNMENT_ACCEPT_MINUTES ?? 10) * 60_000),
    });
    const actor = assignment.assignee as ActorRef;
    await tx.update(schema.processes).set({
      status: nextProcessStatus(process.status, actor.kind === "human"
        ? "waiting_human"
        : assignment.purpose === "checkpoint_review"
          ? "checkpoint"
          : "assigning"),
      updatedAt: new Date(),
    }).where(eq(schema.processes.id, process.id));
  });

  const detail = await getProcessDetailForUser(process.userId, process.id);
  if (!detail) return { ignored: true };
  const assignee = assignment.assignee as ActorRef;
  if (assignee.kind === "human") {
    return executeNextAction({
      kind: "request_human",
      userId: process.userId,
      processId: process.id,
      assignmentId: newId,
      prompt: assignment.purpose === "checkpoint_review"
        ? checkpoint.kind === "opening"
          ? "The opening checkpoint still requires your review before work may start."
          : checkpoint.kind === "recovery"
            ? "A recovery checkpoint still requires your decision."
            : "Submitted work still requires your checkpoint review."
        : "A human work assignment was reissued after timeout or failure. Accept it and submit the requested result.",
    });
  }
  if (assignee.role === "supervisor" && assignment.purpose === "checkpoint_review") {
    return executeNextAction({
      kind: "launch_role",
      role: "supervisor",
      userId: process.userId,
      processId: process.id,
      assignmentId: newId,
      message: [
        `Accept reissued checkpoint-review assignment ${newId} for process ${process.id}.`,
        checkpoint.kind === "recovery"
          ? "Inspect recovery context and call recover_process."
          : "Inspect the submitted work and call review_process.",
      ].join("\n\n"),
    });
  }
  if (assignee.role !== "executor" || assignment.purpose !== "work") return { ignored: true, reason: "unsupported assignment actor" };
  return executeNextAction({
    kind: "launch_role",
    role: "executor",
    userId: process.userId,
    processId: process.id,
    assignmentId: newId,
    message: `Retry assignment ${newId} for process ${process.id}. Previous attempt ${assignment.id} timed out or failed. Load ${process.skillId}, inspect feedback and the dossier, accept the assignment, execute, and submit_work.`,
  });
}

async function dispatchExistingOwnerReview(processId: string, reason: string) {
  const [process] = await db.select().from(schema.processes).where(eq(schema.processes.id, processId)).limit(1);
  if (!process) return { ignored: true };
  const [assignment] = await db.select().from(schema.processAssignments).where(and(
    eq(schema.processAssignments.processId, processId),
    eq(schema.processAssignments.purpose, "checkpoint_review"),
    inArray(schema.processAssignments.status, ["attempting", "accepted"]),
  )).orderBy(desc(schema.processAssignments.createdAt)).limit(1);
  if (!assignment) return { ignored: true, reason: "no active owner checkpoint assignment" };
  const owner = assignment.assignee as ActorRef;
  if (owner.kind === "human") {
    return executeNextAction({
      kind: "request_human",
      processId,
      assignmentId: assignment.id,
      userId: owner.id,
      prompt: `Process recovery or escalation is waiting. ${reason}`,
    });
  }
  if (owner.role !== "supervisor") return { ignored: true, reason: "checkpoint owner is not a supervisor" };
  return executeNextAction({
    kind: "launch_role",
    role: "supervisor",
    userId: process.userId,
    processId,
    assignmentId: assignment.id,
    message: `Accept checkpoint-review assignment ${assignment.id}. ${reason} Inspect the dossier and apply the pending review or recovery decision.`,
  });
}

async function recordDeadlineCheckpoint(processId: string, reason: string) {
  await db.transaction(async (tx) => {
    const [process] = await tx.select().from(schema.processes).where(eq(schema.processes.id, processId)).limit(1);
    if (!process || TERMINAL.includes(process.status as (typeof TERMINAL)[number])) return;
    const phase = Date.now() >= process.dueAt.getTime() ? "breach" : "warning";
    const [existing] = await tx.select().from(schema.processCheckpoints).where(and(
      eq(schema.processCheckpoints.processId, processId),
      eq(schema.processCheckpoints.kind, "deadline"),
    )).orderBy(desc(schema.processCheckpoints.createdAt)).limit(1);
    const existingPayload = existing?.payload && typeof existing.payload === "object"
      ? existing.payload as Record<string, unknown>
      : {};
    if (existingPayload.phase === phase) return;
    const sequence = process.currentCheckpointSeq + 1;
    await tx.insert(schema.processCheckpoints).values({
      id: crypto.randomUUID(),
      processId,
      sequence,
      kind: "deadline",
      status: "applied",
      reviewer: { kind: "llm", role: "metabolism", id: "institution:metabolism" },
      decision: "escalate",
      nextResponsible: process.typeOwner,
      payload: { phase, dueAt: process.dueAt.getTime() },
      review: { accepted: false, findings: [reason], requestedCorrections: ["Review deadline risk without changing or accepting the objective automatically."] },
      expectedRevision: process.revision,
    });
    await tx.update(schema.processes).set({
      currentCheckpointSeq: sequence,
      revision: process.revision + 1,
      updatedAt: new Date(),
    }).where(and(eq(schema.processes.id, processId), eq(schema.processes.revision, process.revision)));
  });
}

async function resetAssignmentSession(assignmentId: string) {
  const [assignment] = await db.select().from(schema.processAssignments).where(eq(schema.processAssignments.id, assignmentId)).limit(1);
  if (!assignment?.continuationToken) return { ignored: true };
  const [process] = await db.select().from(schema.processes).where(eq(schema.processes.id, assignment.processId)).limit(1);
  if (!process) return { ignored: true };
  const client = createInstitutionEveClient({
    role: "executor",
    userId: process.userId,
    processId: process.id,
    assignmentId: assignment.id,
  });
  const session = client.session(assignment.continuationToken);
  const result = await session.reset();
  await db.update(schema.processAssignments).set({ sandboxId: null, continuationToken: null }).where(eq(schema.processAssignments.id, assignment.id));
  return result;
}
