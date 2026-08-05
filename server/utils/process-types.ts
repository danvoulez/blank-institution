import { PROCESS_TYPE_MANIFESTS } from "#shared/generated/process-types";
import type { ActorRef, DeadlineClass, ProcessTypeManifest } from "#shared/types/process";

const byId = new Map<string, ProcessTypeManifest>(
  PROCESS_TYPE_MANIFESTS.map(manifest => [manifest.id, manifest]),
);

export function listProcessTypes(): ProcessTypeManifest[] {
  return [...PROCESS_TYPE_MANIFESTS];
}

export function getProcessType(skillId: string, version?: string): ProcessTypeManifest {
  const manifest = byId.get(skillId);
  if (!manifest || (version !== undefined && manifest.version !== version)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Unknown Process Skill: ${skillId}${version ? `@${version}` : ""}`,
    });
  }
  return manifest;
}

export function validateTypeOwner(manifest: ProcessTypeManifest, actor: ActorRef) {
  const value = actor.kind === "human" ? "human" : actor.role;
  if (value !== "supervisor" && value !== "human") {
    throw createError({ statusCode: 422, statusMessage: "Type owner must be Supervisor or Human" });
  }
  if (!manifest.ownerPolicy.allowed.includes(value)) {
    throw createError({ statusCode: 422, statusMessage: `${value} is not an allowed type owner for ${manifest.id}` });
  }
}

export function validateResponsible(manifest: ProcessTypeManifest, actor: ActorRef) {
  const value = actor.kind === "human" ? "human" : actor.role;
  if (value !== "executor" && value !== "human") {
    throw createError({ statusCode: 422, statusMessage: "Current responsible must be Executor or Human" });
  }
  if (!manifest.responsiblePolicy.allowed.includes(value)) {
    throw createError({ statusCode: 422, statusMessage: `${value} is not an allowed responsible for ${manifest.id}` });
  }
}

export function validateDeadlineClass(manifest: ProcessTypeManifest, value: DeadlineClass) {
  if (!manifest.deadlinePolicy.allowed.includes(value)) {
    throw createError({ statusCode: 422, statusMessage: `${value} is not an allowed deadline for ${manifest.id}` });
  }
}
