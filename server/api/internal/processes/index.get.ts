import { z } from "zod";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { listProcessesForUser } from "~~/server/utils/processes";
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const query = await getValidatedQuery(event, z.object({ userId: z.string().min(1) }).parse);
  return { processes: await listProcessesForUser({ userId: query.userId, limit: 50 }) };
});
