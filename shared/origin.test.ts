import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveInternalOrigin, resolvePublicOrigin } from "./origin.ts";

const TUNNEL = "https://institution.minilab.work";

test("a public URL never becomes the internal one", () => {
  // The regression this split exists for: behind a tunnel, every internal call
  // used to leave the machine and come back through the edge.
  const env = { BETTER_AUTH_URL: TUNNEL };
  assert.equal(resolveInternalOrigin(env), "http://127.0.0.1:3000");
  assert.equal(resolvePublicOrigin(env), TUNNEL);
});

test("INTERNAL_ORIGIN overrides the loopback default", () => {
  assert.equal(
    resolveInternalOrigin({ INTERNAL_ORIGIN: "http://127.0.0.1:8080" }),
    "http://127.0.0.1:8080",
  );
});

test("EVE_INTERNAL_ORIGIN still wins, so existing deployments do not move", () => {
  assert.equal(
    resolveInternalOrigin({ EVE_INTERNAL_ORIGIN: "http://10.88.0.9:3000", INTERNAL_ORIGIN: "http://127.0.0.1:3000" }),
    "http://10.88.0.9:3000",
  );
});

test("the internal default follows the port the server listens on", () => {
  assert.equal(resolveInternalOrigin({ PORT: "4000" }), "http://127.0.0.1:4000");
  assert.equal(resolveInternalOrigin({ NITRO_PORT: "4100" }), "http://127.0.0.1:4100");
  assert.equal(resolveInternalOrigin({ PORT: "4000", NITRO_PORT: "4100" }), "http://127.0.0.1:4000");
});

test("public origin falls back through site URL and Vercel", () => {
  assert.equal(resolvePublicOrigin({ NUXT_PUBLIC_SITE_URL: TUNNEL }), TUNNEL);
  assert.equal(resolvePublicOrigin({ VERCEL_URL: "app.vercel.app" }), "https://app.vercel.app");
  assert.equal(resolvePublicOrigin({}), "http://localhost:3000");
});

test("trailing slashes and blank values are ignored", () => {
  assert.equal(resolvePublicOrigin({ BETTER_AUTH_URL: `${TUNNEL}///` }), TUNNEL);
  assert.equal(resolveInternalOrigin({ INTERNAL_ORIGIN: "   " }), "http://127.0.0.1:3000");
  assert.equal(resolvePublicOrigin({ BETTER_AUTH_URL: "  ", NUXT_PUBLIC_SITE_URL: TUNNEL }), TUNNEL);
});
