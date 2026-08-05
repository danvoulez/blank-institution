import { resolveInternalOrigin } from "../../shared/origin.js";

// The Eve runtime and the Nitro API run in the same process, so every call
// through here stays on loopback. It used to read BETTER_AUTH_URL, which
// behind a tunnel sent each one out to the edge and back — once per model
// step, once per runtime event.
//
// Links meant for a person resolve through resolvePublicOrigin instead.
export function internalOrigin() {
  return resolveInternalOrigin(process.env);
}

export function internalHeaders() {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured");
  }

  return {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  };
}
