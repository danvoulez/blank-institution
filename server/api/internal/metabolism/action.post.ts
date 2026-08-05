import { metabolismActionSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { applyMetabolismAction } from "~~/server/utils/metabolism";
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  return applyMetabolismAction(await readValidatedBody(event, metabolismActionSchema.parse));
});
