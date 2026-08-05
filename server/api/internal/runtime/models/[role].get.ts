import { processRoleSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { getRoleModel } from "~~/server/utils/role-models";

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const role = processRoleSchema.parse(getRouterParam(event, "role"));
  return { model: await getRoleModel(role) };
});
