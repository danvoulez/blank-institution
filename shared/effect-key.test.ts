import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuntimeFact } from "./types/process.ts";
import { canonicalJson } from "./canonical.ts";
import { effectKeyInput } from "./effect-key.ts";

const key = (fact: RuntimeFact) => canonicalJson(effectKeyInput(fact));

function fact(overrides: Partial<RuntimeFact> = {}): RuntimeFact {
  return {
    eventId: "evt_1",
    eventType: "step.completed",
    sessionId: "sess_1",
    occurredAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

test("a re-run step reaches the same key under a new event id", () => {
  const coordinates = { eventType: "step.completed", turnId: "turn_0", stepIndex: 0, sequence: 2 };
  assert.equal(
    key(fact({ ...coordinates, eventId: "evt_first" })),
    key(fact({ ...coordinates, eventId: "evt_retry" })),
  );
});

test("each park of a session gets its own key", () => {
  // session.waiting carries no turn coordinates. Keying it on session and type
  // alone collapsed every park after the first onto one row, and the
  // continuation token stopped being persisted.
  const park = { eventType: "session.waiting" };
  assert.notEqual(
    key(fact({ ...park, eventId: "evt_park_1" })),
    key(fact({ ...park, eventId: "evt_park_2" })),
  );
});

test("session-scoped keys stay distinct across sessions and types", () => {
  assert.notEqual(
    key(fact({ eventType: "session.waiting", sessionId: "sess_1" })),
    key(fact({ eventType: "session.waiting", sessionId: "sess_2" })),
  );
  assert.notEqual(
    key(fact({ eventType: "session.waiting" })),
    key(fact({ eventType: "session.failed" })),
  );
});

test("different coordinates never collapse onto one key", () => {
  assert.notEqual(key(fact({ turnId: "1" })), key(fact({ stepIndex: 1 })));
  assert.notEqual(key(fact({ callId: "1" })), key(fact({ turnId: "1" })));
  assert.notEqual(key(fact({ stepIndex: 0, sequence: 1 })), key(fact({ stepIndex: 1, sequence: 0 })));
});

test("a separator inside an identifier cannot shift the key", () => {
  assert.notEqual(
    key(fact({ sessionId: "a:b", turnId: "c" })),
    key(fact({ sessionId: "a", turnId: "b:c" })),
  );
});

test("stepIndex and sequence of zero still count as coordinates", () => {
  // Zero is falsy but present: these events are step-scoped and must not fall
  // through to the event-id branch, or a retried step would run twice.
  const zeroed = { eventType: "step.completed", stepIndex: 0, sequence: 0 };
  assert.equal(
    key(fact({ ...zeroed, eventId: "evt_first" })),
    key(fact({ ...zeroed, eventId: "evt_retry" })),
  );
});
