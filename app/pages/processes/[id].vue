<script setup lang="ts">
import type { ProcessDetail } from "#shared/types/process";

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: detail, pending, error, refresh } = await useFetch<ProcessDetail>(() => `/api/processes/${id.value}`);
const refreshTimer = import.meta.client ? window.setInterval(() => void refresh(), 10_000) : undefined;
onBeforeUnmount(() => { if (refreshTimer !== undefined) window.clearInterval(refreshTimer); });
</script>

<template>
  <UDashboardPanel id="process-detail" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <UButton to="/processes" icon="i-lucide-list" color="neutral" variant="ghost" label="All processes" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" />
      </Navbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl px-6 py-8">
        <UAlert v-if="error" color="error" variant="subtle" title="Could not load process" :description="error.message" />
        <div v-else-if="pending && !detail" class="space-y-4">
          <USkeleton class="h-40 rounded-xl" />
          <USkeleton class="h-72 rounded-xl" />
        </div>
        <template v-else-if="detail">
          <ProcessHeader :detail="detail" />
          <HumanActionPanel class="mt-5" :detail="detail" @changed="refresh()" />

          <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <div class="space-y-6">
              <section class="rounded-xl border border-default bg-default p-5">
                <h2 class="font-semibold text-highlighted">Objective</h2>
                <p class="mt-2 text-sm text-toned">{{ detail.process.objective.deliverable }}</p>
                <h3 class="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Acceptance criteria</h3>
                <ul class="mt-2 space-y-2 text-sm text-toned">
                  <li v-for="criterion in detail.process.objective.acceptanceCriteria" :key="criterion" class="flex gap-2">
                    <UIcon name="i-lucide-check-circle-2" class="mt-0.5 size-4 shrink-0 text-muted" />
                    <span>{{ criterion }}</span>
                  </li>
                </ul>
              </section>

              <section class="rounded-xl border border-default bg-default p-5">
                <h2 class="font-semibold text-highlighted">Assignments</h2>
                <div v-if="detail.assignments.length" class="mt-4 space-y-3">
                  <AssignmentCard v-for="assignment in [...detail.assignments].reverse()" :key="assignment.id" :assignment="assignment" />
                </div>
                <p v-else class="mt-3 text-sm text-muted">No assignments yet.</p>
              </section>

              <ArtifactList :artifacts="detail.artifacts" />
            </div>

            <CheckpointTimeline :checkpoints="detail.checkpoints" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
