import { requireSessionUserId } from "~~/server/utils/session";
import { listProcessApiTokens } from "~~/server/utils/process-api-tokens";
export default defineEventHandler(async (event) => ({ tokens: await listProcessApiTokens(await requireSessionUserId(event)) }));
