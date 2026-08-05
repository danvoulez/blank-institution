import { runtimeFactSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { ingestRuntimeFact } from "~~/server/utils/process-runtime";
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  return ingestRuntimeFact(await readValidatedBody(event, runtimeFactSchema.parse));
});
