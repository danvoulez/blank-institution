import { z } from "zod";
import { requireSessionUserId } from "~~/server/utils/session";
import { listFailedIntakesForUser } from "~~/server/utils/process-intake";

const querySchema = z.object({
  status: z.literal("failed").default("failed"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event);
  const query = await getValidatedQuery(event, querySchema.parse);
  return { intakes: await listFailedIntakesForUser(userId, query.limit) };
});
