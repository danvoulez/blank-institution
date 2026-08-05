import { z } from "zod";
import { requireSessionUserId } from "~~/server/utils/session";
import { revokeProcessApiToken } from "~~/server/utils/process-api-tokens";
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse);
  const userId = await requireSessionUserId(event);
  if (!await revokeProcessApiToken(userId, id)) throw createError({ statusCode: 404, statusMessage: "Token not found" });
  setResponseStatus(event, 204);
});
