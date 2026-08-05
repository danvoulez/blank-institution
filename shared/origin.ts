// Two origins, deliberately not the same value.
//
// The internal origin is the institution talking to itself: the Eve runtime
// calling the Nitro API, and the control plane starting role sessions. Both
// live in the same process, so this must stay on loopback.
//
// The public origin is what a person or an external service sees: auth
// callbacks, and the links carried inside Slack and iMessage notifications.
//
// They were one value before, read from BETTER_AUTH_URL. Behind a tunnel that
// meant every internal call left the machine, went out to the edge and came
// back — including one per model step and one per runtime event.

export interface OriginEnv {
  INTERNAL_ORIGIN?: string;
  EVE_INTERNAL_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  NUXT_PUBLIC_SITE_URL?: string;
  VERCEL_URL?: string;
  PORT?: string;
  NITRO_PORT?: string;
  // Nitro narrows process.env to its own ProcessEnv; the index signature keeps
  // it assignable without every caller having to pick the keys out by hand.
  [key: string]: string | undefined;
}

const DEFAULT_PORT = "3000";

function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : undefined;
}

export function resolveInternalOrigin(env: OriginEnv): string {
  // EVE_INTERNAL_ORIGIN predates this split and only ever covered the
  // app-to-agent direction. It still wins where it is set so an existing
  // deployment keeps its behaviour.
  const configured = clean(env.EVE_INTERNAL_ORIGIN) ?? clean(env.INTERNAL_ORIGIN);
  if (configured) return configured;

  const port = clean(env.PORT) ?? clean(env.NITRO_PORT) ?? DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

export function resolvePublicOrigin(env: OriginEnv): string {
  const configured = clean(env.BETTER_AUTH_URL) ?? clean(env.NUXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercelUrl = clean(env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl}`;

  const port = clean(env.PORT) ?? clean(env.NITRO_PORT) ?? DEFAULT_PORT;
  return `http://localhost:${port}`;
}
