import { z } from "zod";
import { intakeSourceSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { getLatestActiveProcessForUser } from "~~/server/utils/processes";

const querySchema = z.object({ userId: z.string().min(1), ingress: intakeSourceSchema.optional() });
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const query = await getValidatedQuery(event, querySchema.parse);
  return { process: await getLatestActiveProcessForUser(query.userId, query.ingress) };
});
