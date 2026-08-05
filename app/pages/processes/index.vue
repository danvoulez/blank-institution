<script setup lang="ts">
import type { ProcessIntake, ProcessStatus, ProcessSummary } from "#shared/types/process";

const status = ref<ProcessStatus | "all">("all");
const statusItems = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Assigning", value: "assigning" },
  { label: "Running", value: "running" },
  { label: "Checkpoint", value: "checkpoint" },
  { label: "Waiting for human", value: "waiting_human" },
  { label: "Blocked", value: "blocked" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];

const query = computed(() => status.value === "all" ? { limit: 100 } : { status: status.value, limit: 100 });
const { data, pending, error, refresh } = await useFetch<{ processes: ProcessSummary[] }>("/api/processes", {
  query,
  watch: [query],
});
const { data: failedData, pending: failedPending, refresh: refreshFailed } = await useFetch<{ intakes: ProcessIntake[] }>("/api/process-intakes", {
  query: { status: "failed", limit: 50 },
});
const retryingIntake = ref<string>();
const failedIntakes = computed(() => failedData.value?.intakes ?? []);

async function retryIntake(id: string) {
  retryingIntake.value = id;
  try {
    await $fetch(`/api/process-intakes/${id}/retry`, { method: "POST" });
    await Promise.all([refreshFailed(), refresh()]);
  } finally {
    retryingIntake.value = undefined;
  }
}

const processes = computed(() => data.value?.processes ?? []);
const activeCount = computed(() => processes.value.filter(item => !["completed", "failed", "cancelled"].includes(item.status)).length);
</script>

<template>
  <UDashboardPanel id="processes" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="Promise.all([refresh(), refreshFailed()])" />
      </Navbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl px-6 py-8">
        <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Institution</p>
            <h1 class="mt-1 text-2xl font-semibold text-highlighted">Processes</h1>
            <p class="mt-1 text-sm text-muted">Every intake, assignment, work segment, and checkpoint in one operational view.</p>
          </div>
          <div class="flex items-center gap-3">
            <UBadge color="neutral" variant="soft">{{ activeCount }} active</UBadge>
            <USelect v-model="status" :items="statusItems" value-key="value" class="w-48" />
          </div>
        </header>

        <UAlert v-if="error" color="error" variant="subtle" title="Could not load processes" :description="error.message" />

        <section v-if="failedIntakes.length" class="mb-8 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 class="font-medium text-highlighted">Failed intakes requiring human review</h2>
              <p class="text-sm text-muted">Automatic analysis ended explicitly instead of disappearing. Retry after correcting provider or runtime conditions.</p>
            </div>
            <UBadge color="warning" variant="soft">{{ failedIntakes.length }}</UBadge>
          </div>
          <div class="space-y-3">
            <div v-for="intake in failedIntakes" :key="intake.id" class="rounded-lg border border-default bg-default p-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">{{ intake.rawRequest }}</p>
                  <p class="mt-1 text-xs text-muted">{{ intake.source }} · {{ intake.analysisAttempts }} attempt(s) · {{ intake.failureReason }}</p>
                </div>
                <UButton size="xs" color="warning" variant="soft" icon="i-lucide-rotate-ccw" :loading="retryingIntake === intake.id" @click="retryIntake(intake.id)">Retry analysis</UButton>
              </div>
            </div>
          </div>
        </section>
        <div v-else-if="(pending || failedPending) && !processes.length" class="grid gap-4 md:grid-cols-2">
          <USkeleton v-for="index in 4" :key="index" class="h-36 rounded-xl" />
        </div>
        <div v-else-if="processes.length" class="grid gap-4 md:grid-cols-2">
          <ProcessCard v-for="process in processes" :key="process.id" :process="process" />
        </div>
        <div v-else class="rounded-xl border border-dashed border-default p-10 text-center">
          <UIcon name="i-lucide-workflow" class="mx-auto size-8 text-muted" />
          <h2 class="mt-3 font-medium text-highlighted">No matching processes</h2>
          <p class="mt-1 text-sm text-muted">Start one from chat, the public API, or the MCP server.</p>
          <UButton class="mt-4" to="/" icon="i-lucide-message-square-plus" label="Start in chat" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
