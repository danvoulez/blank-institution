import { assignmentIdParamsSchema, workSubmissionSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { submitWork } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, assignmentIdParamsSchema.parse);
  const userId = await requireSessionUserId(event);
  const body = await readValidatedBody(event, value => workSubmissionSchema.parse({ ...value, assignmentId: id }));
  const result = await submitWork(userId, body);
  await executeNextAction(result.nextAction);
  return result;
});
