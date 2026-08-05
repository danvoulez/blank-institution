import { processIdParamsSchema } from "#shared/schemas/process";
import { requireProcessUser } from "~~/server/utils/process-auth";
import { getProcessDetailForUser } from "~~/server/utils/processes";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, processIdParamsSchema.parse);
  const { userId } = await requireProcessUser(event);
  const detail = await getProcessDetailForUser(userId, id);
  if (!detail) throw createError({ statusCode: 404, statusMessage: "Process not found" });
  return detail;
});
