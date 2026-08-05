import assert from "node:assert/strict";
import test from "node:test";
import { ASSIGNMENT_TRANSITIONS, PROCESS_TRANSITIONS, canAssignmentTransition, canProcessTransition } from "../../shared/process-machine.ts";
import { PROCESS_TYPE_MANIFESTS } from "../../shared/generated/process-types.ts";

test("terminal process states have no outgoing transitions", () => {
  assert.deepEqual(PROCESS_TRANSITIONS.completed, []);
  assert.deepEqual(PROCESS_TRANSITIONS.cancelled, []);
  assert.deepEqual(PROCESS_TRANSITIONS.failed, []);
});

test("universal process cycle supports work, review, correction and closure", () => {
  assert.equal(canProcessTransition("assigning", "running"), true);
  assert.equal(canProcessTransition("running", "checkpoint"), true);
  assert.equal(canProcessTransition("checkpoint", "assigning"), true);
  assert.equal(canProcessTransition("checkpoint", "completed"), true);
  assert.equal(canProcessTransition("completed", "running"), false);
});

test("assignment lifecycle prevents submitted work from being reclaimed", () => {
  assert.equal(canAssignmentTransition("attempting", "accepted"), true);
  assert.equal(canAssignmentTransition("accepted", "running"), true);
  assert.equal(canAssignmentTransition("running", "submitted"), true);
  assert.equal(canAssignmentTransition("submitted", "accepted"), false);
  assert.deepEqual(ASSIGNMENT_TRANSITIONS.submitted, []);
});

test("all installed Process Skills require the mandatory opening checkpoint", () => {
  for (const manifest of PROCESS_TYPE_MANIFESTS) {
    assert.deepEqual(
      [...manifest.openingCheckpoint.required].sort(),
      ["currentResponsible", "deadline", "objective", "typeOwner"],
    );
    assert.equal(manifest.completion.requiresAcceptedClosureCheckpoint, true);
    assert.ok(manifest.stages.length > 0);
  }
});

test("generic delivery supports correction and closure", () => {
  const generic = PROCESS_TYPE_MANIFESTS.find(item => item.id === "generic-delivery");
  if (!generic) throw new Error("generic-delivery manifest is missing");
  const decisions = new Set(generic.stages.flatMap(stage => stage.review.allowedDecisions));
  assert.equal(decisions.has("return"), true);
  assert.equal(decisions.has("reassign"), true);
  assert.equal(decisions.has("complete"), true);
});
