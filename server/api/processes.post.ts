import { submitIntakeSchema } from "#shared/schemas/process";
import { requireProcessUser } from "~~/server/utils/process-auth";
import { submitIntake } from "~~/server/utils/process-intake";
import { launchTranslatorForIntake } from "~~/server/utils/eve-control-plane";

export default defineEventHandler(async (event) => {
  const { userId } = await requireProcessUser(event);
  const body = await readValidatedBody(event, submitIntakeSchema.parse);
  const { intake, created } = await submitIntake({
    principalId: userId,
    source: "api",
    rawRequest: body.rawRequest,
    idempotencyKey: body.idempotencyKey,
    requestedSkillId: body.requestedSkillId,
    threadId: body.threadId,
  });
  let session;
  if (created) {
    session = await launchTranslatorForIntake({
      intakeId: intake.id,
      userId,
      rawRequest: intake.rawRequest,
      requestedSkillId: intake.requestedSkillId,
    });
  }
  setResponseStatus(event, created ? 202 : 200);
  return {
    intakeId: intake.id,
    processId: intake.processId,
    sessionId: session?.sessionId ?? intake.rootSessionId,
    continuationToken: session?.continuationToken ?? intake.continuationToken,
    status: intake.status,
  };
});
