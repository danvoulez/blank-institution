import { processIdParamsSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { prepareIntakeRetry } from "~~/server/utils/process-intake";
import { launchTranslatorForIntake } from "~~/server/utils/eve-control-plane";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, processIdParamsSchema.parse);
  const userId = await requireSessionUserId(event);
  const intake = await prepareIntakeRetry({ id, principalId: userId, allowFailed: true });
  if (!intake) throw createError({ statusCode: 409, statusMessage: "Intake is not available for retry" });
  const session = await launchTranslatorForIntake({
    intakeId: intake.id,
    userId,
    rawRequest: intake.rawRequest,
    requestedSkillId: intake.requestedSkillId,
  });
  return { intake, session };
});
