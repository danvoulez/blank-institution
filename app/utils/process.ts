import type { ActorRef, ProcessDeadline, ProcessStatus } from "#shared/types/process";

export function actorLabel(actor: ActorRef) {
  if (actor.kind === "human") return actor.displayName || `Human · ${actor.id}`;
  return `LLM ${actor.role}`;
}

export function statusLabel(status: ProcessStatus) {
  return status.replaceAll("_", " ");
}

export function deadlineLabel(deadline: ProcessDeadline) {
  const due = new Date(deadline.dueAt);
  const remaining = deadline.dueAt - Date.now();
  const relative = remaining <= 0
    ? `${Math.ceil(Math.abs(remaining) / 3_600_000)}h overdue`
    : remaining < 48 * 3_600_000
      ? `${Math.ceil(remaining / 3_600_000)}h remaining`
      : `${Math.ceil(remaining / 86_400_000)}d remaining`;
  return `${deadline.class} · ${due.toLocaleString()} · ${relative}`;
}
