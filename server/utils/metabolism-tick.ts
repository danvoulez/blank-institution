import type { DigestBudget } from "#shared/metabolism-digest";
import { buildDigest, estimateTokens } from "#shared/metabolism-digest";
import { applyMetabolismAction, scanMetabolism } from "./metabolism";
import { acquireLease, releaseLease } from "./institution-leases";
import { launchMetabolismSession } from "./eve-control-plane";
import { getRoleModel } from "./role-models";

const LEASE = "metabolism-tick";

function number(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function leaseTtlMs() {
  return number("METABOLISM_LEASE_SECONDS", 300) * 1000;
}

async function budgetFor(): Promise<DigestBudget> {
  const settings = await getRoleModel("metabolism");
  return {
    // What the provider advertises, not what the model could do in principle:
    // llama.cpp divides --ctx-size across --parallel slots, so the usable
    // window is a fraction of the model's trained context.
    contextWindowTokens: settings.contextWindowTokens ?? number("METABOLISM_CONTEXT_WINDOW_TOKENS", 2048),
    reserveForOutputTokens: number("METABOLISM_RESERVE_OUTPUT_TOKENS", 512),
    overheadTokens: number("METABOLISM_PROMPT_OVERHEAD_TOKENS", 320),
    maxRecords: number("METABOLISM_MAX_DIGEST_RECORDS", 25),
  };
}

export interface MetabolismTickResult {
  ran: boolean;
  reason?: string;
  deterministic?: { attempted: number; failed: number };
  interpretive?: {
    dispatched: boolean;
    reason?: string;
    records: number;
    omitted: number;
    estimatedTokens: number;
    budget: DigestBudget;
  };
}

// One idempotent entry point for liveness. The external timer, a manual
// trigger and any future scheduler all land here, and the lease means an
// overlapping call observes the run in progress instead of reissuing the same
// assignments a second time.
export async function runMetabolismTick(holder: string): Promise<MetabolismTickResult> {
  const lease = await acquireLease({ name: LEASE, holder, ttlMs: leaseTtlMs() });
  if (!lease.acquired) {
    return { ran: false, reason: "another metabolism tick holds the lease" };
  }

  try {
    const initial = await scanMetabolism();

    // Retry budgets, expired claims and orphan sandboxes are invariants, not
    // judgments. They run first, without a model, so the model only ever sees
    // what is left after the rules have been applied.
    const deterministic = await enforceDeterministicLiveness(initial);
    const current = deterministic.attempted > 0 ? await scanMetabolism() : initial;

    if (current.processes.length === 0) {
      return { ran: true, deterministic };
    }

    const budget = await budgetFor();
    const digest = buildDigest(current.processes, budget);

    if (!digest.fits) {
      // Refusing is the correct outcome: a prompt that overflows the window is
      // silently truncated by the server, and a liveness decision taken on a
      // truncated view is worse than no decision.
      console.error("metabolism digest does not fit its context budget", { budget, candidates: current.processes.length });
      return {
        ran: true,
        deterministic,
        interpretive: { dispatched: false, reason: "digest does not fit the context budget", records: 0, omitted: digest.omitted, estimatedTokens: digest.estimatedTokens, budget },
      };
    }

    const message = interpretiveMessage(digest.records, digest.omitted, deterministic);
    console.log("metabolism interpretive dispatch", {
      records: digest.records.length,
      omitted: digest.omitted,
      estimatedPromptTokens: estimateTokens(message),
      contextWindowTokens: budget.contextWindowTokens,
    });

    await launchMetabolismSession(message);
    return {
      ran: true,
      deterministic,
      interpretive: { dispatched: true, records: digest.records.length, omitted: digest.omitted, estimatedTokens: estimateTokens(message), budget },
    };
  }
  finally {
    await releaseLease({ name: LEASE, holder });
  }
}

async function enforceDeterministicLiveness(scan: Awaited<ReturnType<typeof scanMetabolism>>) {
  const actions: Array<Parameters<typeof applyMetabolismAction>[0]> = [];
  for (const intake of scan.intakes) {
    actions.push({ kind: "retry_intake", intakeId: intake.id });
  }
  for (const assignment of scan.assignments) {
    if (assignment.sandboxId) actions.push({ kind: "close_orphan_sandbox", assignmentId: assignment.id });
    actions.push({ kind: "retry_assignment", assignmentId: assignment.id });
  }

  const results = await Promise.allSettled(actions.map(action => applyMetabolismAction(action)));
  const failed = results.filter(result => result.status === "rejected");
  if (failed.length > 0) {
    console.error("deterministic metabolism actions failed", {
      failed: failed.length,
      reasons: failed.slice(0, 3).map(result => String((result as PromiseRejectedResult).reason)),
    });
  }
  return { attempted: actions.length, failed: failed.length };
}

function interpretiveMessage(
  records: unknown[],
  omitted: number,
  deterministic: { attempted: number; failed: number },
) {
  return [
    `Liveness review. ${records.length} process(es) need a decision${omitted > 0 ? `; ${omitted} more were omitted to fit the context and will appear on a later tick` : ""}.`,
    `Retry budgets, expired claims and orphan sandboxes were already enforced deterministically (${deterministic.attempted} action(s), ${deterministic.failed} failed).`,
    `idle and due are in minutes; due is negative once the deadline has passed.`,
    JSON.stringify(records),
    "Use metabolism_scan if you need the full record for one of these, then apply only process-level liveness actions with metabolism_apply. Never accept work and never change an objective.",
  ].join("\n\n");
}
