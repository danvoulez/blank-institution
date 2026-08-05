import { z } from "zod";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { heartbeatAssignment } from "~~/server/utils/processes";
const bodySchema = z.object({ userId: z.string().min(1), assignmentId: z.string().uuid(), leaseMinutes: z.number().int().min(1).max(1440).optional() });
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  return heartbeatAssignment(await readValidatedBody(event, bodySchema.parse));
});
