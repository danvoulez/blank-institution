import type { ProcessStatus } from "#shared/types/process";
import { canProcessTransition, processTransitionMessage } from "#shared/process-machine";

// Guards a process status write against the transition table. The table was
// declared and unit-tested from the start but never consulted by a handler, so
// every status write went straight to the column — including writes that would
// move a process back out of a terminal state.
export function nextProcessStatus(current: ProcessStatus | string, next: ProcessStatus): ProcessStatus {
  const from = current as ProcessStatus;
  if (!canProcessTransition(from, next)) {
    throw createError({ statusCode: 409, statusMessage: processTransitionMessage(from, next) });
  }
  return next;
}
