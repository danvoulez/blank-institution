import { eq } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { ProcessRole, RoleModelSettings } from "#shared/types/process";

const DEFAULT_MODELS: Record<ProcessRole, string> = {
  translator: "anthropic/claude-sonnet-4.6",
  supervisor: "anthropic/claude-opus-4.6",
  executor: "qwen3-coder",
  metabolism: "qwen3-8b",
};

function prefix(role: ProcessRole) {
  return role.toUpperCase();
}

export function environmentRoleModel(role: ProcessRole): RoleModelSettings {
  const envPrefix = prefix(role);
  const baseURL = process.env[`${envPrefix}_BASE_URL`]?.trim() || undefined;
  const model = process.env[`${envPrefix}_MODEL`]?.trim() || DEFAULT_MODELS[role];
  const contextWindow = Number(process.env[`${envPrefix}_CONTEXT_WINDOW_TOKENS`]);
  return {
    role,
    model,
    mode: baseURL ? "openai-compatible" : "gateway",
    baseURL,
    baseURLConfigured: Boolean(baseURL),
    apiKeyConfigured: Boolean(process.env[`${envPrefix}_API_KEY`]),
    ...(Number.isFinite(contextWindow) && contextWindow >= 1024
      ? { contextWindowTokens: contextWindow }
      : {}),
    source: "environment",
  };
}

export async function getRoleModel(role: ProcessRole): Promise<RoleModelSettings> {
  const [row] = await db.select().from(schema.processRoleModels).where(eq(schema.processRoleModels.role, role)).limit(1);
  if (!row) return environmentRoleModel(role);
  return {
    role,
    model: row.model,
    mode: row.mode,
    baseURL: row.baseUrl ?? undefined,
    baseURLConfigured: Boolean(row.baseUrl),
    apiKeyConfigured: Boolean(process.env[`${prefix(role)}_API_KEY`]),
    contextWindowTokens: row.contextWindowTokens ?? undefined,
    source: "database",
  };
}

export async function listRoleModels(): Promise<RoleModelSettings[]> {
  return Promise.all((["translator", "supervisor", "executor", "metabolism"] as const).map(getRoleModel));
}

export async function updateRoleModel(input: {
  role: ProcessRole;
  model: string;
  mode: "gateway" | "openai-compatible";
  baseURL?: string;
  contextWindowTokens?: number;
  updatedBy: string;
}) {
  const baseUrl = input.mode === "openai-compatible" ? input.baseURL?.trim() || null : null;
  await db.insert(schema.processRoleModels).values({
    role: input.role,
    model: input.model.trim(),
    mode: input.mode,
    baseUrl,
    contextWindowTokens: input.contextWindowTokens,
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.processRoleModels.role,
    set: {
      model: input.model.trim(),
      mode: input.mode,
      baseUrl,
      contextWindowTokens: input.contextWindowTokens,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    },
  });
  return getRoleModel(input.role);
}

export function canManageRuntime(userId: string) {
  const configured = (process.env.INSTITUTION_ADMIN_USER_IDS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured.includes(userId);
  return process.env.NODE_ENV !== "production";
}
