import type { AssignmentStatus, ProcessStatus } from "./types/process";

// Two invariants here are load-bearing, and every status write is checked
// against them:
//
//   1. A terminal process is terminal. Nothing reopens completed, cancelled,
//      or failed — not a late assignment claim, not a scheduled retry.
//   2. Completion requires a checkpoint. `completed` is reachable only from
//      the states a process occupies while its owner holds a review.
//
// The remaining edges are deliberately permissive: they describe the moves the
// current handlers actually make, not a minimal graph. Tightening one changes
// behaviour and belongs with the end-to-end acceptance run, not with a silent
// constraint that starts rejecting a legitimate flow in production.
export const PROCESS_TRANSITIONS: Readonly<Record<ProcessStatus, readonly ProcessStatus[]>> = {
  open: ["assigning", "running", "waiting_human", "checkpoint", "blocked", "failed", "cancelled"],
  assigning: ["running", "waiting_human", "checkpoint", "blocked", "failed", "cancelled"],
  running: ["assigning", "waiting_human", "checkpoint", "blocked", "failed", "cancelled"],
  checkpoint: ["assigning", "running", "waiting_human", "blocked", "completed", "failed", "cancelled"],
  waiting_human: ["assigning", "running", "checkpoint", "blocked", "completed", "failed", "cancelled"],
  blocked: ["assigning", "running", "waiting_human", "checkpoint", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

export const TERMINAL_PROCESS_STATUSES = ["completed", "cancelled", "failed"] as const;

export const PROCESS_STATUSES_NON_TERMINAL = [
  "open",
  "assigning",
  "running",
  "checkpoint",
  "waiting_human",
  "blocked",
] as const satisfies readonly ProcessStatus[];

export function isTerminalProcessStatus(status: ProcessStatus) {
  return (TERMINAL_PROCESS_STATUSES as readonly ProcessStatus[]).includes(status);
}

export const ASSIGNMENT_TRANSITIONS: Readonly<Record<AssignmentStatus, readonly AssignmentStatus[]>> = {
  attempting: ["accepted", "declined", "timed_out", "revoked", "failed"],
  accepted: ["running", "submitted", "timed_out", "revoked", "failed"],
  running: ["submitted", "timed_out", "revoked", "failed"],
  submitted: [],
  declined: [],
  timed_out: [],
  revoked: [],
  failed: [],
};

export function canProcessTransition(from: ProcessStatus, to: ProcessStatus) {
  return from === to || PROCESS_TRANSITIONS[from].includes(to);
}

export function canAssignmentTransition(from: AssignmentStatus, to: AssignmentStatus) {
  return from === to || ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export function processTransitionMessage(from: ProcessStatus, to: ProcessStatus) {
  return isTerminalProcessStatus(from)
    ? `Process is ${from} and cannot move to ${to}`
    : `Process cannot move from ${from} to ${to}`;
}
