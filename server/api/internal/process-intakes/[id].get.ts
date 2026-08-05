import { z } from "zod";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { getIntakeForUser } from "~~/server/utils/process-intake";

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse);
  const query = await getValidatedQuery(event, z.object({ userId: z.string().min(1) }).parse);
  const intake = await getIntakeForUser(query.userId, id);
  if (!intake) throw createError({ statusCode: 404, statusMessage: "Intake not found" });
  return { intake };
});
