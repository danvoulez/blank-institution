import { z } from "zod";
import { artifactInputSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { storeProcessArtifact } from "~~/server/utils/process-artifacts";
const bodySchema = z.object({ userId: z.string().min(1), artifact: artifactInputSchema });
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  return { artifact: await storeProcessArtifact({ userId: body.userId, ...body.artifact }) };
});
