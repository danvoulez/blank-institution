<script setup lang="ts">
import type { ProcessRole, RoleModelSettings } from "#shared/types/process";

type RuntimeResponse = {
  runtime: { host: string; health: unknown; info: unknown };
  models: RoleModelSettings[];
  canEdit: boolean;
};

const { data, pending, error, refresh } = await useFetch<RuntimeResponse>("/api/runtime");
const healthy = computed(() => Boolean(data.value?.runtime?.health));
const drafts = reactive<Partial<Record<ProcessRole, RoleModelSettings>>>({});
const saving = ref<ProcessRole>();
const saveError = ref<string>();

watchEffect(() => {
  for (const model of data.value?.models ?? []) {
    if (!drafts[model.role]) drafts[model.role] = structuredClone(model);
  }
});

const modeItems = [
  { label: "AI Gateway", value: "gateway" },
  { label: "OpenAI-compatible endpoint", value: "openai-compatible" },
];

async function save(role: ProcessRole) {
  const draft = drafts[role];
  if (!draft) return;
  saving.value = role;
  saveError.value = undefined;
  try {
    await $fetch("/api/runtime", {
      method: "PATCH",
      body: {
        role,
        model: draft.model,
        mode: draft.mode,
        baseURL: draft.mode === "openai-compatible" ? draft.baseURL : undefined,
        contextWindowTokens: draft.contextWindowTokens || undefined,
      },
    });
    drafts[role] = undefined;
    await refresh();
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = undefined;
  }
}
</script>

<template>
  <UDashboardPanel id="runtime" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
      </Navbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl px-6 py-8">
        <header class="mb-8">
          <h1 class="mb-1 text-lg font-medium text-highlighted">Settings</h1>
          <p class="max-w-3xl text-sm text-muted">Runtime inspection and persistent role-model routing, promoted from Eve's CLI control plane into the product.</p>
        </header>
        <SettingsNav class="mb-8" />

        <UAlert v-if="error" color="error" variant="subtle" title="Eve runtime is unreachable" :description="error.message" />
        <div v-else-if="pending" class="space-y-4">
          <USkeleton class="h-32 rounded-xl" />
          <USkeleton class="h-72 rounded-xl" />
        </div>
        <div v-else-if="data" class="space-y-8">
          <UAlert v-if="saveError" color="error" variant="subtle" title="Could not save model routing" :description="saveError" />

          <SettingsSection title="Runtime" :description="data.runtime.host">
            <SettingsRow label="Health" description="Official Eve Client health probe.">
              <UBadge :color="healthy ? 'success' : 'error'" variant="soft">{{ healthy ? 'Healthy' : 'Unavailable' }}</UBadge>
            </SettingsRow>
            <SettingsRow label="Agent info" description="Compiled agent manifest exposed by Eve.">
              <pre class="max-h-56 max-w-xl overflow-auto rounded-md bg-elevated p-3 text-xs">{{ JSON.stringify(data.runtime.info, null, 2) }}</pre>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Role model routing" description="A role is fixed by authenticated session metadata. New sessions resolve this configuration through defineDynamic; API keys remain environment secrets.">
            <div v-for="model in data.models" :key="model.role" class="border-b border-default px-4 py-5 last:border-b-0">
              <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium capitalize text-highlighted">{{ model.role }}</p>
                    <UBadge color="neutral" variant="soft">{{ model.source }}</UBadge>
                  </div>
                  <p class="mt-1 text-xs text-muted">{{ model.apiKeyConfigured ? 'Role API key configured' : 'No role API key detected' }}</p>
                </div>
                <UButton v-if="data.canEdit" size="sm" :loading="saving === model.role" @click="save(model.role)">Save for new sessions</UButton>
              </div>

              <div v-if="drafts[model.role]" class="grid gap-4 md:grid-cols-2">
                <UFormField label="Model ID">
                  <UInput v-model="drafts[model.role]!.model" :disabled="!data.canEdit" class="w-full" />
                </UFormField>
                <UFormField label="Routing mode">
                  <USelect v-model="drafts[model.role]!.mode" :items="modeItems" value-key="value" :disabled="!data.canEdit" class="w-full" />
                </UFormField>
                <UFormField v-if="drafts[model.role]!.mode === 'openai-compatible'" label="Base URL" description="For example http://gpu-host:8000/v1">
                  <UInput v-model="drafts[model.role]!.baseURL" :disabled="!data.canEdit" class="w-full" />
                </UFormField>
                <UFormField label="Context window tokens" description="Optional explicit override for unlisted/local models.">
                  <UInput v-model.number="drafts[model.role]!.contextWindowTokens" type="number" min="1024" :disabled="!data.canEdit" class="w-full" />
                </UFormField>
              </div>
            </div>
          </SettingsSection>

          <UAlert v-if="!data.canEdit" color="warning" variant="subtle" title="Read-only runtime settings" description="Set INSTITUTION_ADMIN_USER_IDS to the Better Auth user IDs allowed to change global model routing in production." />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
