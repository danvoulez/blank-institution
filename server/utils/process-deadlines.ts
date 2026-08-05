import type { DeadlineClass, ProcessDeadline } from "#shared/types/process";

const DURATIONS_MS: Record<Exclude<DeadlineClass, "urgent">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
};

export function resolveDeadline(
  input: { class: DeadlineClass; dueAt?: number },
  now = Date.now(),
): ProcessDeadline {
  if (input.dueAt !== undefined) {
    if (!Number.isFinite(input.dueAt) || input.dueAt <= now) {
      throw createError({ statusCode: 422, statusMessage: "dueAt must be a future timestamp" });
    }
    return { class: input.class, dueAt: input.dueAt };
  }

  if (input.class === "urgent") {
    const hours = Number(process.env.SLA_URGENT_HOURS);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw createError({
        statusCode: 422,
        statusMessage: "Urgent requires dueAt or a positive SLA_URGENT_HOURS",
      });
    }
    return { class: input.class, dueAt: now + hours * 60 * 60 * 1000 };
  }

  return { class: input.class, dueAt: now + DURATIONS_MS[input.class] };
}

export function deadlineWarningAt(deadline: ProcessDeadline, createdAt: number): number {
  const ratio = deadline.class === "urgent" ? 0.5 : deadline.class === "24h" ? 0.75 : 0.8;
  return createdAt + Math.max(1, deadline.dueAt - createdAt) * ratio;
}
