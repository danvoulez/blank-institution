import { submitIntakeSchema } from "#shared/schemas/process";
import { submitIntake } from "~~/server/utils/process-intake";
import { requireSessionUserId } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event);
  const body = await readValidatedBody(event, submitIntakeSchema.parse);
  const result = await submitIntake({
    principalId: userId,
    source: "web",
    rawRequest: body.rawRequest,
    idempotencyKey: body.idempotencyKey,
    requestedSkillId: body.requestedSkillId,
    threadId: body.threadId,
  });
  setResponseStatus(event, result.created ? 201 : 200);
  return result;
});
