import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalJson } from "./canonical.ts";

const sha256 = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");

test("matches the RFC 8785 worked example byte for byte", () => {
  const canonical = canonicalJson({ b: 2, a: [1, 0.5], c: "hi" });
  assert.equal(canonical, "{\"a\":[1,0.5],\"b\":2,\"c\":\"hi\"}");
  assert.equal(sha256(canonical), "54927d21fad3946f67210fdacd35b9eecc06842b4a0c4fcf33e382a301f7246f");
});

test("sorts object keys by UTF-16 code unit and leaves arrays alone", () => {
  assert.equal(canonicalJson({ b: 1, A: 2, _c: 3, a: 4 }), "{\"A\":2,\"_c\":3,\"a\":4,\"b\":1}");
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
});

test("insertion order never changes the canonical form", () => {
  assert.equal(
    canonicalJson({ sessionId: "s", eventType: "turn.failed", turnId: "t" }),
    canonicalJson({ turnId: "t", eventType: "turn.failed", sessionId: "s" }),
  );
});

test("an undefined field canonicalizes the same as an absent one", () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
  assert.equal(canonicalJson([1, undefined]), "[1,null]");
});

test("distinct coordinate shapes never collide", () => {
  // The positional join this replaced mapped both of these to "s:e:1".
  assert.notEqual(
    canonicalJson({ sessionId: "s", eventType: "e", turnId: "1" }),
    canonicalJson({ sessionId: "s", eventType: "e", stepIndex: 1 }),
  );
  // A separator inside a value cannot shift the parse of its neighbours.
  assert.notEqual(
    canonicalJson({ sessionId: "a:b", eventType: "c" }),
    canonicalJson({ sessionId: "a", eventType: "b:c" }),
  );
});

test("serializes numbers with the ECMAScript algorithm the RFC mandates", () => {
  assert.equal(canonicalJson(42), "42");
  assert.equal(canonicalJson(-0), "0");
  assert.equal(canonicalJson(0.5), "0.5");
  assert.equal(canonicalJson(Number.MAX_SAFE_INTEGER), "9007199254740991");
  // The signed exponent form is required, not a formatting accident.
  assert.equal(canonicalJson(1e21), "1e+21");
  assert.equal(canonicalJson(1e-7), "1e-7");
});

test("escapes strings including code points above the BMP", () => {
  assert.equal(canonicalJson("a\tb\nc"), "\"a\\tb\\nc\"");
  assert.equal(canonicalJson("🌙"), "\"🌙\"");
});

test("rejects values that cannot be canonicalized", () => {
  assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), /non-finite/);
  assert.throws(() => canonicalJson(() => undefined), /cannot canonicalize/);

  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle), /cycle/);
});
