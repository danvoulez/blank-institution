<script setup lang="ts">
type TokenRow = { id: string; name: string; tokenPrefix: string; createdAt: number; lastUsedAt?: number; revokedAt?: number };
type CreatedToken = TokenRow & { token: string };
const name = ref("Institution API");
const revealed = ref<CreatedToken>();
const creating = ref(false);
const toast = useToast();
const { data, pending, error, refresh } = await useFetch<{ tokens: TokenRow[] }>("/api/process-api-tokens");
const tokens = computed(() => data.value?.tokens ?? []);

async function createToken() {
  creating.value = true;
  try {
    const result = await $fetch<{ token: CreatedToken }>("/api/process-api-tokens", { method: "POST", body: { name: name.value.trim() } });
    revealed.value = result.token;
    await refresh();
  } catch (error) {
    toast.add({ title: "Could not create token", description: error instanceof Error ? error.message : String(error), color: "error" });
  } finally { creating.value = false; }
}
async function revoke(id: string) {
  await $fetch(`/api/process-api-tokens/${id}`, { method: "DELETE" });
  await refresh();
}
async function copyToken() {
  if (!revealed.value) return;
  await navigator.clipboard.writeText(revealed.value.token);
  toast.add({ title: "Token copied", color: "success" });
}
</script>

<template>
  <UDashboardPanel id="process-api" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header><Navbar /></template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl px-6 py-8">
        <header class="mb-8"><h1 class="mb-1 text-lg font-medium text-highlighted">Settings</h1><p class="max-w-2xl text-sm text-muted">Create scoped bearer tokens for the public process API and the inbound MCP server.</p></header>
        <SettingsNav class="mb-8" />

        <UAlert v-if="revealed" class="mb-6" color="warning" variant="subtle" title="Copy this token now" description="It is shown only once.">
          <template #actions><UButton color="neutral" variant="outline" icon="i-lucide-copy" label="Copy" @click="copyToken" /></template>
          <template #description><code class="mt-2 block break-all rounded bg-default px-3 py-2 text-xs">{{ revealed.token }}</code></template>
        </UAlert>

        <SettingsSection title="Create token" description="Tokens act as the owning user and can create or inspect that user's processes.">
          <SettingsRow label="Name" description="Use a name that identifies the calling system.">
            <div class="flex w-full gap-2"><UInput v-model="name" class="flex-1" /><UButton label="Create" icon="i-lucide-key-round" :loading="creating" :disabled="!name.trim()" @click="createToken" /></div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection class="mt-8" title="Tokens" description="Revoked tokens stop working immediately.">
          <div v-if="pending" class="p-4"><USkeleton class="h-20 rounded-md" /></div>
          <UAlert v-else-if="error" class="m-4" color="error" variant="subtle" title="Could not load tokens" :description="error.message" />
          <div v-else-if="tokens.length">
            <SettingsRow v-for="token in tokens" :key="token.id" :label="token.name" :description="`${token.tokenPrefix}… · created ${new Date(token.createdAt).toLocaleString()}`">
              <div class="flex items-center gap-2"><UBadge v-if="token.revokedAt" color="neutral" variant="soft">Revoked</UBadge><UButton v-else color="error" variant="ghost" size="xs" label="Revoke" @click="revoke(token.id)" /></div>
            </SettingsRow>
          </div>
          <p v-else class="p-4 text-sm text-muted">No API tokens yet.</p>
        </SettingsSection>
      </div>
    </template>
  </UDashboardPanel>
</template>
