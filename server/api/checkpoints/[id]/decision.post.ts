import { checkpointIdParamsSchema, humanDecisionSchema } from "#shared/schemas/process";
import type { SupervisorReviewDecision } from "#shared/types/process";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import { requireSessionUserId } from "~~/server/utils/session";
import { applyOpeningCheckpointDecision, applyRecoveryDecision, applyReviewDecision } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, checkpointIdParamsSchema.parse);
  const userId = await requireSessionUserId(event);
  const body = await readValidatedBody(event, humanDecisionSchema.parse);
  const [checkpoint] = await db.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.id, id)).limit(1);
  if (!checkpoint) throw createError({ statusCode: 404, statusMessage: "Checkpoint not found" });

  if (checkpoint.kind === "opening" && checkpoint.status === "pending") {
    const [assignment] = await db.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.checkpointId, checkpoint.id),
      eq(schema.processAssignments.purpose, "checkpoint_review"),
    )).orderBy(desc(schema.processAssignments.createdAt)).limit(1);
    if (!assignment) throw createError({ statusCode: 409, statusMessage: "Opening review assignment is missing" });
    if (!["accept", "reassign", "cancel", "fail"].includes(body.decision)) {
      throw createError({ statusCode: 422, statusMessage: "Opening review allows accept, reassign, cancel, or fail" });
    }
    const result = await applyOpeningCheckpointDecision({
      userId,
      checkpointId: checkpoint.id,
      assignmentId: assignment.id,
      reviewer: { kind: "human", id: userId },
      expectedRevision: body.expectedRevision,
      decision: body.decision as "accept" | "reassign" | "cancel" | "fail",
      feedback: body.feedback,
      typeOwner: body.typeOwner,
      currentResponsible: body.currentResponsible ?? body.nextResponsible,
      objective: body.objective,
      deadline: body.deadline,
      workOrder: body.workOrder,
    });
    await executeNextAction(result.nextAction);
    return result;
  }

  if (checkpoint.kind === "recovery" && checkpoint.status === "pending") {
    const [reviewAssignment] = await db.select().from(schema.processAssignments).where(and(
      eq(schema.processAssignments.checkpointId, checkpoint.id),
      eq(schema.processAssignments.purpose, "checkpoint_review"),
      eq(schema.processAssignments.status, "accepted"),
    )).orderBy(desc(schema.processAssignments.acceptedAt)).limit(1);
    if (!reviewAssignment) throw createError({ statusCode: 409, statusMessage: "Accept the recovery review assignment before deciding" });
    if (!["return", "reassign", "cancel", "fail"].includes(body.decision)) {
      throw createError({ statusCode: 422, statusMessage: "Recovery allows retry, reassign, cancel, or fail" });
    }
    const result = await applyRecoveryDecision({
      userId,
      reviewer: { kind: "human", id: userId },
      reviewAssignmentId: reviewAssignment.id,
      decision: {
        processId: checkpoint.processId,
        expectedRevision: body.expectedRevision,
        decision: body.decision as "return" | "reassign" | "cancel" | "fail",
        feedback: body.feedback || "Recovery decision applied by the human type owner.",
        nextResponsible: body.nextResponsible ?? body.currentResponsible,
        workOrder: body.workOrder,
      },
    });
    await executeNextAction(result.nextAction);
    return result;
  }

  const [assignment] = await db.select().from(schema.processAssignments).where(and(
    eq(schema.processAssignments.processId, checkpoint.processId),
    eq(schema.processAssignments.purpose, "work"),
    eq(schema.processAssignments.status, "submitted"),
  )).orderBy(desc(schema.processAssignments.submittedAt)).limit(1);
  if (!assignment) throw createError({ statusCode: 409, statusMessage: "No submitted assignment is awaiting review" });
  const [reviewAssignment] = await db.select().from(schema.processAssignments).where(and(
    eq(schema.processAssignments.processId, checkpoint.processId),
    eq(schema.processAssignments.checkpointId, assignment.checkpointId),
    eq(schema.processAssignments.purpose, "checkpoint_review"),
    eq(schema.processAssignments.status, "accepted"),
  )).orderBy(desc(schema.processAssignments.acceptedAt)).limit(1);
  if (!reviewAssignment) throw createError({ statusCode: 409, statusMessage: "Accept the checkpoint-review assignment before deciding" });

  const decision: SupervisorReviewDecision = {
    processId: checkpoint.processId,
    assignmentId: assignment.id,
    expectedRevision: body.expectedRevision,
    decision: body.decision,
    findings: body.feedback ? [body.feedback] : [],
    requestedCorrections: body.decision === "return" && body.feedback ? [body.feedback] : [],
    nextResponsible: body.nextResponsible,
    workOrder: body.workOrder,
  };
  const result = await applyReviewDecision({
    userId,
    reviewer: { kind: "human", id: userId },
    decision,
    reviewAssignmentId: reviewAssignment.id,
  });
  await executeNextAction(result.nextAction);
  return result;
});
