import type { H3Event } from "h3";
import { authenticateProcessApiToken } from "./process-api-tokens";
import { requireSessionUserId } from "./session";

export async function requireProcessUser(event: H3Event): Promise<{ userId: string; via: "session" | "token" }> {
  const authorization = getRequestHeader(event, "authorization") ?? "";
  if (authorization.startsWith("Bearer evi_")) {
    return { userId: await authenticateProcessApiToken(event), via: "token" };
  }
  return { userId: await requireSessionUserId(event), via: "session" };
}
