<script setup lang="ts">
import type { ProcessSummary } from "#shared/types/process";
import { actorLabel, deadlineLabel, statusLabel } from "~/utils/process";
defineProps<{ process: ProcessSummary }>();
</script>
<template>
  <NuxtLink :to="`/processes/${process.id}`" class="block rounded-xl border border-default bg-default p-4 transition hover:bg-elevated">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ process.skillName }}</p>
        <h2 class="mt-1 truncate font-semibold text-highlighted">{{ process.objective.deliverable }}</h2>
      </div>
      <UBadge color="neutral" variant="soft" class="capitalize">{{ statusLabel(process.status) }}</UBadge>
    </div>
    <div class="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-2">
      <span>Responsible: {{ actorLabel(process.currentResponsible) }}</span>
      <span>{{ deadlineLabel(process.deadline) }}</span>
    </div>
  </NuxtLink>
</template>
