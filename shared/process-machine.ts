import type { AssignmentStatus, ProcessStatus } from "./types/process";

export const PROCESS_TRANSITIONS: Readonly<Record<ProcessStatus, readonly ProcessStatus[]>> = {
  open: ["assigning", "waiting_human", "failed", "cancelled"],
  assigning: ["running", "blocked", "failed", "cancelled"],
  running: ["checkpoint", "blocked", "failed", "cancelled"],
  checkpoint: ["assigning", "waiting_human", "completed", "failed", "cancelled", "blocked"],
  waiting_human: ["running", "checkpoint", "blocked", "failed", "cancelled"],
  blocked: ["assigning", "waiting_human", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

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
