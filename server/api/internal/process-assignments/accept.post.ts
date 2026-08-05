import { z } from "zod";
import { acceptAssignmentSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { acceptAssignment, executorActor, supervisorActor } from "~~/server/utils/processes";

const bodySchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  actorRole: z.enum(["supervisor", "executor"]),
  input: acceptAssignmentSchema,
});
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  return acceptAssignment({
    userId: body.userId,
    assignmentId: body.input.assignmentId,
    leaseMinutes: body.input.leaseMinutes,
    sessionId: body.sessionId,
    actor: body.actorRole === "supervisor" ? supervisorActor() : executorActor(),
  });
});
