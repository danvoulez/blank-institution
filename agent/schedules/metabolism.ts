import { defineSchedule } from "eve/schedules";
import eve from "../channels/eve.js";
import { internalHeaders, internalOrigin } from "../lib/internal-api.js";

interface ScanIntake {
  id: string;
}

interface ScanAssignment {
  id: string;
  sandboxId?: string;
}

interface MetabolismScan {
  generatedAt: number;
  intakes: ScanIntake[];
  assignments: ScanAssignment[];
  processes: unknown[];
}

async function scan(): Promise<MetabolismScan> {
  const response = await fetch(`${internalOrigin()}/api/internal/metabolism/scan`, {
    headers: internalHeaders(),
  });
  if (!response.ok) throw new Error(`Metabolism scan failed: ${response.status}`);
  return response.json() as Promise<MetabolismScan>;
}

async function apply(action: Record<string, unknown>) {
  const response = await fetch(`${internalOrigin()}/api/internal/metabolism/action`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify(action),
  });
  if (!response.ok) throw new Error(`Metabolism action failed (${response.status}): ${JSON.stringify(action)}`);
  return response.json();
}

async function enforceDeterministicLiveness(current: MetabolismScan) {
  const actions: Array<Record<string, unknown>> = [];
  for (const intake of current.intakes) {
    actions.push({ kind: "retry_intake", intakeId: intake.id });
  }
  for (const assignment of current.assignments) {
    if (assignment.sandboxId) {
      actions.push({ kind: "close_orphan_sandbox", assignmentId: assignment.id });
    }
    actions.push({ kind: "retry_assignment", assignmentId: assignment.id });
  }
  const results = await Promise.allSettled(actions.map(apply));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length > 0) {
    console.error("deterministic metabolism actions failed", { failures: failures.length });
  }
  return { attempted: actions.length, failed: failures.length };
}

export default defineSchedule({
  cron: process.env.METABOLISM_SCHEDULE || "*/5 * * * *",
  async run({ receive, waitUntil, appAuth }) {
    const initial = await scan();

    // Intake retry budgets, expired claims/leases, and orphan sandbox cleanup are
    // invariants, not model judgments. Execute them deterministically first.
    const enforced = await enforceDeterministicLiveness(initial);
    const current = enforced.attempted > 0 ? await scan() : initial;
    const count = current.processes.length;
    if (count === 0) return;

    // The local-small Metabolism role handles only interpretation-bearing work:
    // blocked process recovery, deadline escalation, and human reminders.
    waitUntil(receive(eve, {
      auth: {
        ...appAuth,
        attributes: {
          ...(appAuth.attributes ?? {}),
          role: "metabolism",
          userId: "system",
        },
      },
      message: [
        `Metabolism scan found ${count} process candidate(s) after deterministic liveness enforcement.`,
        JSON.stringify({ ...current, deterministic: enforced }),
        "Use metabolism_scan to refresh current state, then apply only valid process-level liveness actions with metabolism_apply. Never accept work or change objectives.",
      ].join("\n\n"),
    }));
  },
});
