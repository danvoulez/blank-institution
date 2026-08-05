import type { DynamicResolveContext } from "eve";
import type { ProcessRole } from "../../shared/types/process.js";

export interface InstitutionSessionContext {
  role: ProcessRole;
  userId?: string;
  intakeId?: string;
  processId?: string;
  assignmentId?: string;
}

function stringAttribute(attributes: unknown, key: string): string | undefined {
  if (!attributes || typeof attributes !== "object") return undefined;
  const value = (attributes as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function institutionContext(ctx: DynamicResolveContext): InstitutionSessionContext {
  const current = ctx.session.auth.current;
  const attributes = current?.attributes;
  const role = stringAttribute(attributes, "role");
  return {
    role: role === "supervisor" || role === "executor" || role === "metabolism" ? role : "translator",
    userId: stringAttribute(attributes, "userId") ?? (current?.principalId && !current.principalId.startsWith("eve:") ? current.principalId : undefined),
    intakeId: stringAttribute(attributes, "intakeId"),
    processId: stringAttribute(attributes, "processId"),
    assignmentId: stringAttribute(attributes, "assignmentId"),
  };
}

export function roleFromAuthAttributes(attributes: unknown): ProcessRole {
  const role = stringAttribute(attributes, "role");
  return role === "supervisor" || role === "executor" || role === "metabolism" ? role : "translator";
}
