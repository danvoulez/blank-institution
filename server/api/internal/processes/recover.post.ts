import { z } from "zod";
import { recoveryDecisionSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { applyRecoveryDecision, supervisorActor } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

const bodySchema = z.object({
  userId: z.string().min(1),
  reviewAssignmentId: z.string().uuid(),
  decision: recoveryDecisionSchema,
});

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  const result = await applyRecoveryDecision({
    userId: body.userId,
    reviewer: supervisorActor(),
    reviewAssignmentId: body.reviewAssignmentId,
    decision: body.decision,
  });
  await executeNextAction(result.nextAction);
  return result;
});
