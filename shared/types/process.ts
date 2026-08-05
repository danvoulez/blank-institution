export const PROCESS_ROLES = ["translator", "supervisor", "executor", "metabolism"] as const;
export type ProcessRole = (typeof PROCESS_ROLES)[number];

export const INTAKE_SOURCES = ["api", "mcp", "web", "slack", "imessage"] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

export const DEADLINE_CLASSES = ["urgent", "24h", "1w", "1m"] as const;
export type DeadlineClass = (typeof DEADLINE_CLASSES)[number];

export const PROCESS_STATUSES = [
  "open",
  "assigning",
  "running",
  "checkpoint",
  "waiting_human",
  "blocked",
  "completed",
  "cancelled",
  "failed",
] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  "attempting",
  "accepted",
  "running",
  "submitted",
  "declined",
  "timed_out",
  "revoked",
  "failed",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CHECKPOINT_DECISIONS = [
  "assign",
  "accept",
  "return",
  "reassign",
  "escalate",
  "complete",
  "cancel",
  "fail",
] as const;
export type CheckpointDecision = (typeof CHECKPOINT_DECISIONS)[number];

export type ActorRef =
  | { kind: "human"; id: string; displayName?: string }
  | { kind: "llm"; role: ProcessRole; id: string };

export interface ProcessDeadline {
  class: DeadlineClass;
  dueAt: number;
}

export interface ProcessObjective {
  deliverable: string;
  acceptanceCriteria: string[];
}

export interface ProcessIntake {
  id: string;
  idempotencyKey: string;
  source: IntakeSource;
  principalId: string;
  rawRequest: string;
  normalizedRequest?: string;
  requestedSkillId?: string;
  threadId?: string;
  rootSessionId?: string;
  continuationToken?: string;
  status: "received" | "translating" | "analyzing" | "converted" | "failed";
  processId?: string;
  failureReason?: string;
  analysisAttempts: number;
  lastAttemptAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessRecord {
  id: string;
  intakeId: string;
  userId: string;
  rootSessionId?: string;
  continuationToken?: string;
  threadId?: string;
  ingress: IntakeSource;
  skillId: string;
  skillVersion: string;
  typeOwner: ActorRef;
  currentResponsible: ActorRef;
  objective: ProcessObjective;
  deadline: ProcessDeadline;
  status: ProcessStatus;
  currentCheckpointSeq: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface WorkOrder {
  objective: string;
  acceptanceCriteria: string[];
  requiredCapabilities: string[];
  stageId?: string;
}

export interface CheckpointReview {
  accepted: boolean;
  findings: string[];
  requestedCorrections: string[];
}

export interface ProcessCheckpoint {
  id: string;
  processId: string;
  sequence: number;
  kind: "opening" | "review" | "closure" | "deadline" | "recovery";
  status: "pending" | "applied";
  reviewer: ActorRef;
  receivedFrom?: ActorRef;
  decision?: CheckpointDecision;
  nextResponsible?: ActorRef;
  workOrder?: WorkOrder;
  review?: CheckpointReview;
  payload?: unknown;
  result?: unknown;
  expectedRevision: number;
  sourceEventId?: string;
  createdAt: number;
}

export interface ProcessAssignment {
  id: string;
  processId: string;
  checkpointId: string;
  purpose: "work" | "checkpoint_review";
  assignee: ActorRef;
  status: AssignmentStatus;
  attempt: number;
  childSessionId?: string;
  continuationToken?: string;
  sandboxId?: string;
  feedback?: string;
  acceptDeadlineAt: number;
  leaseExpiresAt?: number;
  issuedAt: number;
  acceptedAt?: number;
  submittedAt?: number;
  createdAt: number;
}

export interface ProcessArtifact {
  id: string;
  processId: string;
  assignmentId?: string;
  name: string;
  mimeType: string;
  inlineText?: string;
  externalUri?: string;
  digest: string;
  createdAt: number;
}

export interface WorkSubmission {
  processId: string;
  assignmentId: string;
  summary: string;
  result: unknown;
  artifactIds: string[];
  limitations: string[];
  recommendedNextAction?: string;
}

export interface ProcessStageManifest {
  id: string;
  title: string;
  responsible: "executor" | "human" | "either";
  requiredCapabilities: string[];
  instructions: string;
  review: {
    reviewer: "typeOwner";
    allowedDecisions: CheckpointDecision[];
  };
}

export interface ProcessTypeManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  ownerPolicy: {
    allowed: Array<"supervisor" | "human">;
    default: "supervisor" | "human";
  };
  responsiblePolicy: {
    allowed: Array<"executor" | "human">;
    default: "executor" | "human";
  };
  deadlinePolicy: {
    allowed: DeadlineClass[];
    default: DeadlineClass;
  };
  openingCheckpoint: {
    required: Array<"typeOwner" | "currentResponsible" | "objective" | "deadline">;
  };
  stages: ProcessStageManifest[];
  completion: {
    requiresAcceptedClosureCheckpoint: true;
  };
}

export interface ProcessSummary {
  id: string;
  skillId: string;
  skillName: string;
  status: ProcessStatus;
  objective: ProcessObjective;
  currentResponsible: ActorRef;
  deadline: ProcessDeadline;
  updatedAt: number;
}

export interface ProcessDetail {
  process: ProcessRecord;
  intake: ProcessIntake;
  checkpoints: ProcessCheckpoint[];
  assignments: ProcessAssignment[];
  artifacts: ProcessArtifact[];
  type: ProcessTypeManifest;
}

export type NextAction =
  | { kind: "launch_role"; role: "translator" | "supervisor" | "executor"; userId: string; processId?: string; intakeId?: string; assignmentId?: string; message: string }
  | { kind: "request_human"; processId: string; assignmentId: string; userId: string; prompt: string }
  | { kind: "complete"; processId: string }
  | { kind: "park"; processId: string; reason: string }
  | { kind: "none" };

export interface SupervisorOpeningDecision {
  intakeId: string;
  processType: { skillId: string; version: string };
  typeOwner: ActorRef;
  currentResponsible: ActorRef;
  objective: ProcessObjective;
  deadline: { class: DeadlineClass; dueAt?: number };
  workOrder: WorkOrder;
  rationale: string;
}

export interface SupervisorReviewDecision {
  processId: string;
  assignmentId: string;
  expectedRevision: number;
  decision: Exclude<CheckpointDecision, "assign">;
  findings: string[];
  requestedCorrections: string[];
  nextResponsible?: ActorRef;
  workOrder?: WorkOrder;
}


export interface ProcessRecoveryDecision {
  processId: string;
  expectedRevision: number;
  decision: "return" | "reassign" | "cancel" | "fail";
  feedback: string;
  nextResponsible?: ActorRef;
  workOrder?: WorkOrder;
}

export type MetabolismAction =
  | { kind: "retry_intake"; intakeId: string }
  | { kind: "retry_assignment"; assignmentId: string }
  | { kind: "resume_process"; processId: string; reason: string }
  | { kind: "remind_human"; processId: string; assignmentId: string }
  | { kind: "escalate"; processId: string; reason: string }
  | { kind: "close_orphan_sandbox"; assignmentId: string };

export interface RuntimeFact {
  eventId: string;
  eventType: string;
  sessionId: string;
  occurredAt: string;
  turnId?: string;
  stepIndex?: number;
  sequence?: number;
  callId?: string;
  data?: unknown;
}

export interface RoleModelSettings {
  role: ProcessRole;
  model: string;
  mode: "gateway" | "openai-compatible";
  baseURL?: string;
  baseURLConfigured: boolean;
  apiKeyConfigured: boolean;
  contextWindowTokens?: number;
  source: "database" | "environment";
}
