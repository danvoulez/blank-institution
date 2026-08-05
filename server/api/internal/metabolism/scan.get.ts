import { requireInternalRequest } from "~~/server/utils/internal-api";
import { scanMetabolism } from "~~/server/utils/metabolism";
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  return scanMetabolism();
});
