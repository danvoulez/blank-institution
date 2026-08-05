import { translateIntakeSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { saveTranslatedIntake } from "~~/server/utils/process-intake";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, translateIntakeSchema.parse);
  const intake = await saveTranslatedIntake(body);
  if (!intake) throw createError({ statusCode: 404, statusMessage: "Intake not found" });
  const nextAction = {
    kind: "launch_role" as const,
    role: "supervisor" as const,
    userId: intake.principalId,
    intakeId: intake.id,
    message: [
      `Analyze intake ${intake.id} and create its mandatory opening checkpoint.`,
      `Normalized request:\n${intake.normalizedRequest}`,
      intake.requestedSkillId ? `Suggested Process Skill: ${intake.requestedSkillId}` : "Select the best installed Process Skill; use triage-review if classification is unsafe.",
      "Call open_process exactly once. You are the Supervisor: define owner, responsible, objective, acceptance criteria, deadline, and the first work order.",
    ].join("\n\n"),
  };
  await executeNextAction(nextAction);
  return { intake, nextAction };
});
