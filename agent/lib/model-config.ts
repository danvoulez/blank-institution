import type { ProcessRole, RoleModelSettings } from "../../shared/types/process.js";
import { internalHeaders, internalOrigin } from "./internal-api.js";

const DEFAULTS: Record<ProcessRole, string> = {
  translator: "anthropic/claude-sonnet-4.6",
  supervisor: "anthropic/claude-opus-4.6",
  executor: "qwen3-coder",
  metabolism: "qwen3-8b",
};

function environmentModel(role: ProcessRole): RoleModelSettings {
  const prefix = role.toUpperCase();
  const baseURL = process.env[`${prefix}_BASE_URL`]?.trim() || undefined;
  const context = Number(process.env[`${prefix}_CONTEXT_WINDOW_TOKENS`]);
  return {
    role,
    model: process.env[`${prefix}_MODEL`]?.trim() || DEFAULTS[role],
    mode: baseURL ? "openai-compatible" : "gateway",
    baseURL,
    baseURLConfigured: Boolean(baseURL),
    apiKeyConfigured: Boolean(process.env[`${prefix}_API_KEY`]),
    ...(Number.isFinite(context) && context >= 1024 ? { contextWindowTokens: context } : {}),
    source: "environment",
  };
}

export async function resolveRoleModel(role: ProcessRole): Promise<RoleModelSettings> {
  try {
    const response = await fetch(`${internalOrigin()}/api/internal/runtime/models/${role}`, { headers: internalHeaders() });
    if (!response.ok) return environmentModel(role);
    return ((await response.json()) as { model: RoleModelSettings }).model;
  } catch {
    return environmentModel(role);
  }
}

export function roleApiKey(role: ProcessRole) {
  return process.env[`${role.toUpperCase()}_API_KEY`] || "local";
}
