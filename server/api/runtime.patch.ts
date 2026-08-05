import { roleModelUpdateSchema } from "#shared/schemas/process";
import { requireSessionUserId } from "~~/server/utils/session";
import { canManageRuntime, updateRoleModel } from "~~/server/utils/role-models";

export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event);
  if (!canManageRuntime(userId)) throw createError({ statusCode: 403, statusMessage: "Runtime model configuration is restricted to institution administrators" });
  const body = await readValidatedBody(event, roleModelUpdateSchema.parse);
  return { model: await updateRoleModel({
    role: body.role,
    model: body.model,
    mode: body.mode,
    baseURL: body.baseURL || undefined,
    contextWindowTokens: body.contextWindowTokens,
    updatedBy: userId,
  }) };
});
