import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessStatus } from "../../shared/types/process.ts";
import { ASSIGNMENT_TRANSITIONS, PROCESS_STATUSES_NON_TERMINAL, PROCESS_TRANSITIONS, canAssignmentTransition, canProcessTransition } from "../../shared/process-machine.ts";
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

test("nothing leaves a terminal state, whatever the target", () => {
  for (const terminal of ["completed", "cancelled", "failed"] as const) {
    for (const target of PROCESS_STATUSES_NON_TERMINAL) {
      assert.equal(canProcessTransition(terminal, target), false, `${terminal} -> ${target}`);
    }
    // A stale claim on a closed process is the concrete case: acceptAssignment
    // used to write "running" without consulting the machine at all.
    assert.equal(canProcessTransition(terminal, "running"), false);
  }
});

test("completion is reachable only while the owner holds a review", () => {
  const completers = PROCESS_STATUSES_NON_TERMINAL.filter(status => canProcessTransition(status, "completed"));
  assert.deepEqual([...completers].sort(), ["checkpoint", "waiting_human"]);
});

test("every transition a handler performs is permitted", () => {
  // Enumerated from the status writes in processes.ts, metabolism.ts and
  // process-recovery.ts. A handler that starts making a move absent from this
  // list will be rejected at runtime, so the move belongs here first.
  const performed: Array<[ProcessStatus, ProcessStatus]> = [
    // acceptAssignment: claiming work, then claiming a checkpoint review
    ["assigning", "running"], ["waiting_human", "running"], ["blocked", "running"],
    ["checkpoint", "checkpoint"], ["waiting_human", "waiting_human"], ["blocked", "checkpoint"],
    // openProcessFromSupervisor -> applyOpeningCheckpointDecision
    ["waiting_human", "assigning"], ["waiting_human", "cancelled"], ["waiting_human", "failed"],
    // submitWork
    ["running", "checkpoint"], ["running", "waiting_human"],
    // applyReviewDecision
    ["checkpoint", "completed"], ["waiting_human", "completed"],
    ["checkpoint", "assigning"], ["checkpoint", "waiting_human"],
    ["checkpoint", "cancelled"], ["checkpoint", "failed"],
    // applyRecoveryDecision, always from blocked
    ["blocked", "assigning"], ["blocked", "waiting_human"], ["blocked", "cancelled"], ["blocked", "failed"],
    // retryAssignment reissuing an expired claim
    ["running", "assigning"], ["assigning", "waiting_human"], ["assigning", "checkpoint"],
    // openRecoveryCheckpoint
    ["open", "blocked"], ["assigning", "blocked"], ["running", "blocked"],
    ["checkpoint", "blocked"], ["waiting_human", "blocked"],
  ];

  for (const [from, to] of performed) {
    assert.equal(canProcessTransition(from, to), true, `${from} -> ${to}`);
  }
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
