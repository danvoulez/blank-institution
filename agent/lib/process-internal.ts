import { internalHeaders, internalOrigin } from "./internal-api.js";
import type {
  MetabolismAction,
  ProcessDetail,
  ProcessIntake,
  ProcessSummary,
  ProcessRecoveryDecision,
  SupervisorOpeningDecision,
  SupervisorReviewDecision,
  WorkSubmission,
} from "../../shared/types/process.js";

async function internalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${internalOrigin()}${path}`, {
    ...init,
    headers: { ...internalHeaders(), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Institution API ${response.status}: ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}


export async function createIntakeRemote(input: {
  userId: string;
  source: "slack" | "imessage";
  rawRequest: string;
  idempotencyKey: string;
}) {
  return internalFetch<{ intake: ProcessIntake; created: boolean }>("/api/internal/process-intakes", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      source: input.source,
      input: { rawRequest: input.rawRequest, idempotencyKey: input.idempotencyKey },
    }),
  });
}

export async function getActiveProcessRemote(userId: string, ingress: "imessage" | "slack") {
  return internalFetch<{ process?: { id: string; intakeId: string } }>(
    `/api/internal/processes/active?userId=${encodeURIComponent(userId)}&ingress=${encodeURIComponent(ingress)}`,
  );
}

export async function getIntakeRemote(userId: string, id: string): Promise<ProcessIntake> {
  return (await internalFetch<{ intake: ProcessIntake }>(`/api/internal/process-intakes/${id}?userId=${encodeURIComponent(userId)}`)).intake;
}

export async function submitTranslationRemote(input: {
  intakeId: string;
  normalizedRequest: string;
  suggestedSkillId?: string;
  sessionId?: string;
}) {
  return internalFetch(`/api/internal/process-intakes/${input.intakeId}/translate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function openProcessRemote(userId: string, decision: SupervisorOpeningDecision) {
  return internalFetch<{ detail: ProcessDetail }>("/api/internal/processes/open", {
    method: "POST",
    body: JSON.stringify({ userId, decision }),
  });
}

export async function getProcessRemote(userId: string, processId: string): Promise<ProcessDetail> {
  return internalFetch<ProcessDetail>(`/api/internal/processes/${processId}?userId=${encodeURIComponent(userId)}`);
}

export async function reviewProcessRemote(
  userId: string,
  decision: SupervisorReviewDecision,
  reviewAssignmentId: string,
) {
  return internalFetch<{ detail: ProcessDetail }>("/api/internal/processes/review", {
    method: "POST",
    body: JSON.stringify({ userId, decision, reviewAssignmentId }),
  });
}


export async function recoverProcessRemote(
  userId: string,
  decision: ProcessRecoveryDecision,
  reviewAssignmentId: string,
) {
  return internalFetch<{ detail: ProcessDetail }>("/api/internal/processes/recover", {
    method: "POST",
    body: JSON.stringify({ userId, decision, reviewAssignmentId }),
  });
}

export async function acceptAssignmentRemote(input: {
  userId: string;
  assignmentId: string;
  sessionId?: string;
  leaseMinutes?: number;
  actorRole: "supervisor" | "executor";
}) {
  return internalFetch("/api/internal/process-assignments/accept", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      sessionId: input.sessionId,
      actorRole: input.actorRole,
      input: { assignmentId: input.assignmentId, leaseMinutes: input.leaseMinutes ?? 30 },
    }),
  });
}

export async function heartbeatAssignmentRemote(input: { userId: string; assignmentId: string; leaseMinutes?: number }) {
  return internalFetch("/api/internal/process-assignments/heartbeat", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function storeArtifactRemote(input: {
  userId: string;
  processId: string;
  assignmentId?: string;
  name: string;
  mimeType: string;
  inlineText?: string;
  externalUri?: string;
}) {
  return internalFetch<{ artifact: { id: string; digest: string } }>("/api/internal/process-artifacts", {
    method: "POST",
    body: JSON.stringify({ userId: input.userId, artifact: { ...input, userId: undefined } }),
  });
}

export async function submitWorkRemote(userId: string, submission: WorkSubmission) {
  return internalFetch<{ detail: ProcessDetail }>("/api/internal/process-assignments/submit", {
    method: "POST",
    body: JSON.stringify({ userId, submission }),
  });
}

export async function listProcessesRemote(userId: string): Promise<ProcessSummary[]> {
  const response = await fetch(`${internalOrigin()}/api/internal/processes?userId=${encodeURIComponent(userId)}`, {
    headers: internalHeaders(),
  });
  if (!response.ok) return [];
  return ((await response.json()) as { processes: ProcessSummary[] }).processes;
}

export async function metabolismScanRemote() {
  return internalFetch<unknown>("/api/internal/metabolism/scan");
}

export async function metabolismActionRemote(action: MetabolismAction) {
  return internalFetch("/api/internal/metabolism/action", {
    method: "POST",
    body: JSON.stringify(action),
  });
}

export async function buildInstitutionContext(input: {
  userId?: string;
  intakeId?: string;
  processId?: string;
  assignmentId?: string;
}) {
  const blocks: string[] = [];
  if (input.userId && input.intakeId) {
    try {
      const intake = await getIntakeRemote(input.userId, input.intakeId);
      blocks.push(`# Intake\n\n${JSON.stringify(intake, null, 2)}`);
    } catch (error) {
      blocks.push(`# Intake\n\nUnable to load intake ${input.intakeId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (input.userId && input.processId) {
    try {
      const detail = await getProcessRemote(input.userId, input.processId);
      blocks.push(`# Process dossier\n\n${JSON.stringify(detail, null, 2)}`);
    } catch (error) {
      blocks.push(`# Process dossier\n\nUnable to load process ${input.processId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (input.assignmentId) blocks.push(`# Active assignment\n\n${input.assignmentId}`);
  return blocks.join("\n\n---\n\n");
}
