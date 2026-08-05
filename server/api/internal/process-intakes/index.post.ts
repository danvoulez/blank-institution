import { z } from "zod";
import { submitIntakeSchema, intakeSourceSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { submitIntake } from "~~/server/utils/process-intake";

const bodySchema = z.object({
  userId: z.string().min(1),
  source: intakeSourceSchema,
  input: submitIntakeSchema,
});

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  return submitIntake({
    principalId: body.userId,
    source: body.source,
    rawRequest: body.input.rawRequest,
    idempotencyKey: body.input.idempotencyKey,
    requestedSkillId: body.input.requestedSkillId,
    threadId: body.input.threadId,
  });
});
