import { processIdParamsSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { getProcessSummaryForThread } from "~~/server/utils/processes";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, processIdParamsSchema.parse);
  const userId = await requireSessionUserId(event);
  return { process: await getProcessSummaryForThread(userId, id) };
});
