import { Client } from "eve/client";
import type { NextAction, ProcessRole } from "#shared/types/process";
import { resolveInternalOrigin } from "#shared/origin";
import { linkRoleSession } from "./processes";
import { notifyHumanAssignment } from "./process-notifications";
import { markIntakeTranslating } from "./process-intake";

// The agent routes are mounted by eve/nuxt in this same Nitro app, so starting
// a role session is a loopback call, not a trip through whatever public name
// the app answers to.
function eveHost() {
  return resolveInternalOrigin(process.env);
}

function secret() {
  const value = process.env.INTERNAL_API_SECRET?.trim();
  if (!value) throw createError({ statusCode: 503, statusMessage: "INTERNAL_API_SECRET is not configured" });
  return value;
}

export function createInstitutionEveClient(input: {
  role: ProcessRole;
  userId: string;
  intakeId?: string;
  processId?: string;
  assignmentId?: string;
}) {
  return new Client({
    host: eveHost(),
    auth: { bearer: secret() },
    preserveCompletedSessions: true,
    headers: {
      "x-institution-role": input.role,
      "x-institution-user-id": input.userId,
      ...(input.intakeId ? { "x-institution-intake-id": input.intakeId } : {}),
      ...(input.processId ? { "x-institution-process-id": input.processId } : {}),
      ...(input.assignmentId ? { "x-institution-assignment-id": input.assignmentId } : {}),
    },
  });
}

export async function launchRoleSession(input: {
  role: "translator" | "supervisor" | "executor";
  userId: string;
  message: string;
  intakeId?: string;
  processId?: string;
  assignmentId?: string;
}) {
  const client = createInstitutionEveClient(input);
  const session = client.session();
  // send() resolves once the turn is accepted, not once it finishes, so a
  // failure inside the turn surfaces later through the runtime hook. A failure
  // *here* means the session never started: no session id was assigned, so no
  // hook can correlate it back to this assignment, and only the accept deadline
  // would notice. Log it with the coordinates that make it diagnosable.
  let response;
  try {
    response = await session.send({
      message: input.message,
      clientContext: {
        institution: {
          role: input.role,
          userId: input.userId,
          ...(input.intakeId ? { intakeId: input.intakeId } : {}),
          ...(input.processId ? { processId: input.processId } : {}),
          ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
        },
      },
    });
  } catch (error) {
    console.error("institution role session failed to start", {
      role: input.role,
      userId: input.userId,
      intakeId: input.intakeId,
      processId: input.processId,
      assignmentId: input.assignmentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  await linkRoleSession({
    role: input.role,
    intakeId: input.intakeId,
    processId: input.processId,
    assignmentId: input.assignmentId,
    sessionId: response.sessionId,
    continuationToken: response.continuationToken,
  });
  return {
    sessionId: response.sessionId,
    continuationToken: response.continuationToken,
  };
}

// The Metabolism role owns no intake, process or assignment, so unlike the
// other roles there is nothing to link the session back to.
export async function launchMetabolismSession(message: string) {
  const client = createInstitutionEveClient({ role: "metabolism", userId: "system" });
  const response = await client.session().send({
    message,
    clientContext: { institution: { role: "metabolism", userId: "system" } },
  });
  return { sessionId: response.sessionId, continuationToken: response.continuationToken };
}

export async function executeNextAction(action: NextAction) {
  switch (action.kind) {
    case "launch_role":
      return launchRoleSession(action);
    case "request_human": {
      const attempts = await notifyHumanAssignment({
        userId: action.userId,
        processId: action.processId,
        assignmentId: action.assignmentId,
        prompt: action.prompt,
      });
      return { waitingForHuman: true, assignmentId: action.assignmentId, attempts };
    }
    case "complete":
      return { completed: true, processId: action.processId };
    case "park":
      return { parked: true, processId: action.processId, reason: action.reason };
    case "none":
      return { noAction: true };
  }
}

export async function launchTranslatorForIntake(input: {
  intakeId: string;
  userId: string;
  rawRequest: string;
  requestedSkillId?: string;
}) {
  const session = await launchRoleSession({
    role: "translator",
    intakeId: input.intakeId,
    userId: input.userId,
    message: [
      `Translate intake ${input.intakeId} into a complete institutional request.`,
      `Original request:\n${input.rawRequest}`,
      input.requestedSkillId ? `Requested Process Skill: ${input.requestedSkillId}` : "No Process Skill was preselected.",
      "Preserve all constraints. Call submit_for_supervision exactly once. Do not execute the work and do not decide acceptance.",
    ].join("\n\n"),
  });
  await markIntakeTranslating(input.intakeId, session.sessionId);
  return session;
}

export async function inspectEveRuntime() {
  const client = new Client({ host: eveHost(), auth: { bearer: secret() } });
  const [health, info] = await Promise.all([
    client.health(),
    client.info().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
  ]);
  return { health, info, host: eveHost() };
}
