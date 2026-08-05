import type { AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { vercelOidc } from "eve/channels/auth";
import { auth } from "../../auth";
import type { ProcessRole } from "../../shared/types/process.js";
import { getIntakeRemote, getProcessRemote } from "../lib/process-internal.js";

function appSession(): AuthFn<Request> {
  return async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return null;
    const requestedIntakeId = request.headers.get("x-institution-intake-id") ?? undefined;
    const requestedProcessId = request.headers.get("x-institution-process-id") ?? undefined;
    const intakeId = requestedIntakeId
      ? await getIntakeRemote(session.user.id, requestedIntakeId).then(value => value.id).catch(() => undefined)
      : undefined;
    const processId = requestedProcessId
      ? await getProcessRemote(session.user.id, requestedProcessId).then(value => value.process.id).catch(() => undefined)
      : undefined;
    return {
      attributes: {
        email: session.user.email,
        name: session.user.name,
        role: "translator",
        userId: session.user.id,
        intakeId,
        processId,
      },
      authenticator: "app",
      issuer: "app",
      principalId: session.user.id,
      principalType: "user",
    };
  };
}

function serviceSession(): AuthFn<Request> {
  return async (request) => {
    const secret = process.env.INTERNAL_API_SECRET?.trim();
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return null;
    const roleHeader = request.headers.get("x-institution-role");
    const role: ProcessRole = roleHeader === "supervisor" || roleHeader === "executor" || roleHeader === "metabolism"
      ? roleHeader
      : "translator";
    const userId = request.headers.get("x-institution-user-id") ?? undefined;
    return {
      attributes: {
        role,
        userId,
        intakeId: request.headers.get("x-institution-intake-id") ?? undefined,
        processId: request.headers.get("x-institution-process-id") ?? undefined,
        assignmentId: request.headers.get("x-institution-assignment-id") ?? undefined,
      },
      authenticator: "institution-service",
      issuer: "institution",
      principalId: `institution:${role}:${userId ?? "system"}`,
      principalType: "runtime",
    };
  };
}

export default eveChannel({ auth: [appSession(), serviceSession(), vercelOidc()] });
