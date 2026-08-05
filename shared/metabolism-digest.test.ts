import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProcessRecord, ProcessStatus } from "./types/process.ts";
import { buildDigest, estimateTokens } from "./metabolism-digest.ts";

const NOW = Date.UTC(2026, 7, 6, 12, 0, 0);
const MINUTE = 60_000;

function process(overrides: {
  id: string;
  status?: ProcessStatus;
  idleMinutes?: number;
  dueInMinutes?: number;
}): ProcessRecord {
  return {
    id: overrides.id,
    intakeId: "intake",
    userId: "user",
    ingress: "web",
    skillId: "generic-delivery",
    skillVersion: "1.0.0",
    typeOwner: { kind: "llm", role: "supervisor", id: "institution:supervisor" },
    currentResponsible: { kind: "llm", role: "executor", id: "institution:executor" },
    objective: { deliverable: "d", acceptanceCriteria: [] },
    deadline: { class: "24h", dueAt: NOW + (overrides.dueInMinutes ?? 600) * MINUTE },
    status: overrides.status ?? "running",
    currentCheckpointSeq: 1,
    revision: 1,
    createdAt: NOW - 1000 * MINUTE,
    updatedAt: NOW - (overrides.idleMinutes ?? 5) * MINUTE,
  };
}

const ROOMY = { contextWindowTokens: 8192, reserveForOutputTokens: 512, overheadTokens: 256, maxRecords: 100 };

test("a scan far larger than the window is truncated instead of overflowing", () => {
  const many = Array.from({ length: 300 }, (_, index) => process({ id: `p${index}`.padEnd(36, "0") }));
  const tight = { contextWindowTokens: 2048, reserveForOutputTokens: 512, overheadTokens: 256, maxRecords: 100 };
  const result = buildDigest(many, tight, NOW);

  assert.ok(result.records.length > 0, "should keep what fits");
  assert.ok(result.omitted > 0, "should report what it dropped");
  assert.equal(result.records.length + result.omitted, 300);
  assert.ok(
    result.estimatedTokens <= tight.contextWindowTokens - tight.reserveForOutputTokens - tight.overheadTokens,
    `estimated ${result.estimatedTokens} must stay inside the budget`,
  );
});

test("the hard record cap applies even when the window is roomy", () => {
  const many = Array.from({ length: 50 }, (_, index) => process({ id: `p${index}` }));
  const result = buildDigest(many, { ...ROOMY, maxRecords: 10 }, NOW);
  assert.equal(result.records.length, 10);
  assert.equal(result.omitted, 40);
});

test("truncation drops the least urgent, never an arbitrary tail", () => {
  const result = buildDigest([
    process({ id: "calm", dueInMinutes: 900 }),
    process({ id: "overdue", dueInMinutes: -30 }),
    process({ id: "blocked", status: "blocked", dueInMinutes: 800 }),
  ], { ...ROOMY, maxRecords: 2 }, NOW);

  assert.deepEqual(result.records.map(record => record.id), ["blocked", "overdue"]);
});

test("a window too small for even one record reports that it does not fit", () => {
  const result = buildDigest([process({ id: "p1" })], {
    contextWindowTokens: 300,
    reserveForOutputTokens: 256,
    overheadTokens: 40,
    maxRecords: 100,
  }, NOW);

  assert.equal(result.fits, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.omitted, 1);
});

test("an empty scan fits trivially and carries nothing", () => {
  const result = buildDigest([], ROOMY, NOW);
  assert.equal(result.records.length, 0);
  assert.equal(result.omitted, 0);
  assert.equal(result.fits, false);
});

test("the projection keeps only what a liveness decision needs", () => {
  const [record] = buildDigest([process({ id: "p1", idleMinutes: 42, dueInMinutes: -15, status: "blocked" })], ROOMY, NOW).records;
  assert.deepEqual(record, {
    id: "p1",
    status: "blocked",
    idle: 42,
    due: -15,
    deadline: "24h",
    owed: "executor",
  });
});

test("token estimation grows with length", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(estimateTokens("a".repeat(400)) >= 100);
});
