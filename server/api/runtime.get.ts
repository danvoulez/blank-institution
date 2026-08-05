import { requireSessionUserId } from "~~/server/utils/session";
import { inspectEveRuntime } from "~~/server/utils/eve-control-plane";
import { canManageRuntime, listRoleModels } from "~~/server/utils/role-models";

export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event);
  return {
    runtime: await inspectEveRuntime(),
    models: await listRoleModels(),
    canEdit: canManageRuntime(userId),
  };
});
