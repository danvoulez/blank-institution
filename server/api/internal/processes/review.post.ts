import { z } from "zod";
import { supervisorReviewSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { applyReviewDecision, supervisorActor } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

const bodySchema = z.object({
  userId: z.string().min(1),
  decision: supervisorReviewSchema,
  reviewAssignmentId: z.string().uuid(),
});
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  const result = await applyReviewDecision({
    userId: body.userId,
    reviewer: supervisorActor(),
    decision: body.decision,
    reviewAssignmentId: body.reviewAssignmentId,
  });
  await executeNextAction(result.nextAction);
  return result;
});
