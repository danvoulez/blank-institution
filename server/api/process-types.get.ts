import { requireSessionUserId } from "~~/server/utils/session";
import { listProcessTypes } from "~~/server/utils/process-types";

export default defineEventHandler(async (event) => {
  await requireSessionUserId(event);
  return { processTypes: listProcessTypes() };
});
