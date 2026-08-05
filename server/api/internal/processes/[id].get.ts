import { z } from "zod";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { getProcessDetailForUser } from "~~/server/utils/processes";

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse);
  const query = await getValidatedQuery(event, z.object({ userId: z.string().min(1) }).parse);
  const detail = await getProcessDetailForUser(query.userId, id);
  if (!detail) throw createError({ statusCode: 404, statusMessage: "Process not found" });
  return detail;
});
