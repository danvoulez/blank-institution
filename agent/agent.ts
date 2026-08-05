import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent, defineDynamic } from "eve";
import type { ProcessRole, RoleModelSettings } from "../shared/types/process.js";
import { resolveRoleModel, roleApiKey } from "./lib/model-config.js";
import { roleFromAuthAttributes } from "./lib/role-context.js";

const translatorFallback = process.env.TRANSLATOR_MODEL || "anthropic/claude-sonnet-4.6";

function gatewaySelection(settings: RoleModelSettings) {
  const selection: {
    model: string;
    modelContextWindowTokens?: number;
    modelOptions?: { providerOptions: Record<string, Record<string, unknown>> };
  } = { model: settings.model };
  if (settings.contextWindowTokens) selection.modelContextWindowTokens = settings.contextWindowTokens;
  if (settings.role === "supervisor" && settings.model.startsWith("anthropic/")) {
    selection.modelOptions = {
      providerOptions: {
        anthropic: { thinking: { type: "enabled", budgetTokens: 4096 } },
      },
    };
  }
  return selection;
}

function directSelection(settings: RoleModelSettings) {
  if (!settings.baseURL) return null;
  const provider = createOpenAICompatible({
    name: `institution-${settings.role}`,
    baseURL: settings.baseURL,
    apiKey: roleApiKey(settings.role),
  });
  return {
    model: provider.chatModel(settings.model),
    ...(settings.contextWindowTokens
      ? { modelContextWindowTokens: settings.contextWindowTokens }
      : {}),
  };
}

async function settingsFor(ctx: { session: { auth: { current?: { attributes?: unknown } | null } } }) {
  const role: ProcessRole = roleFromAuthAttributes(ctx.session.auth.current?.attributes);
  return resolveRoleModel(role);
}

export default defineAgent({
  model: defineDynamic({
    fallback: translatorFallback,
    events: {
      async "session.started"(_event, ctx) {
        const settings = await settingsFor(ctx);
        return settings.mode === "gateway" ? gatewaySelection(settings) : null;
      },
      async "step.started"(_event, ctx) {
        const settings = await settingsFor(ctx);
        return settings.mode === "openai-compatible" ? directSelection(settings) : null;
      },
    },
  }),
  compaction: { thresholdPercent: 0.8 },
  limits: {
    maxInputTokensPerSession: 2_000_000,
    maxOutputTokensPerSession: 200_000,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
  },
});
