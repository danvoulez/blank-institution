import { requireInternalRequest } from "~~/server/utils/internal-api";
import { runMetabolismTick } from "~~/server/utils/metabolism-tick";

export default defineEventHandler(async (event) => {
  requireInternalRequest(event);

  // Read from the query rather than a body so the external timer stays a
  // one-line curl with nothing to keep in sync. `holder` only names whoever
  // fired the tick, so a log line says which timer or operator held the lease.
  const holder = getQuery(event).holder;
  const name = typeof holder === "string" && holder.trim() ? holder.trim().slice(0, 200) : undefined;

  return runMetabolismTick(name ?? `tick:${crypto.randomUUID()}`);
});
