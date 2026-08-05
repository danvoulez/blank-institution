import { z } from "zod";
import { supervisorOpeningSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { openProcessFromSupervisor } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

const bodySchema = z.object({ userId: z.string().min(1), decision: supervisorOpeningSchema });
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  const result = await openProcessFromSupervisor(body.userId, body.decision);
  await executeNextAction(result.nextAction);
  return result;
});
