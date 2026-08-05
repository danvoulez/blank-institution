import { processListQuerySchema } from "#shared/schemas/process";
import { requireProcessUser } from "~~/server/utils/process-auth";
import { listProcessesForUser } from "~~/server/utils/processes";

export default defineEventHandler(async (event) => {
  const { userId } = await requireProcessUser(event);
  const query = await getValidatedQuery(event, processListQuerySchema.parse);
  return { processes: await listProcessesForUser({ userId, ...query }) };
});
