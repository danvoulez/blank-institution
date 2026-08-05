import { assignmentIdParamsSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { acceptAssignment } from "~~/server/utils/processes";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, assignmentIdParamsSchema.parse);
  const userId = await requireSessionUserId(event);
  return acceptAssignment({ userId, assignmentId: id, actor: { kind: "human", id: userId } });
});
