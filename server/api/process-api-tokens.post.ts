import { apiTokenCreateSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { createProcessApiToken } from "~~/server/utils/process-api-tokens";
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event);
  const body = await readValidatedBody(event, apiTokenCreateSchema.parse);
  setResponseStatus(event, 201);
  return { token: await createProcessApiToken(userId, body.name) };
});
