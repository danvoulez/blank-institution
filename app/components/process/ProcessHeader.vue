<script setup lang="ts">
import type { ProcessDetail } from "#shared/types/process";
import { actorLabel, deadlineLabel, statusLabel } from "~/utils/process";
defineProps<{ detail: ProcessDetail }>();
</script>
<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-sm text-muted">{{ detail.type.name }} · {{ detail.process.skillVersion }}</p>
        <h1 class="mt-1 text-2xl font-bold text-highlighted">{{ detail.process.objective.deliverable }}</h1>
      </div>
      <UBadge color="neutral" variant="soft" size="lg" class="capitalize">{{ statusLabel(detail.process.status) }}</UBadge>
    </div>
    <div class="grid gap-3 rounded-xl border border-default bg-elevated/40 p-4 sm:grid-cols-3">
      <div><p class="text-xs uppercase text-muted">Type owner</p><p class="mt-1 text-sm font-medium">{{ actorLabel(detail.process.typeOwner) }}</p></div>
      <div><p class="text-xs uppercase text-muted">Current responsible</p><p class="mt-1 text-sm font-medium">{{ actorLabel(detail.process.currentResponsible) }}</p></div>
      <div><p class="text-xs uppercase text-muted">Deadline</p><p class="mt-1 text-sm font-medium">{{ deadlineLabel(detail.process.deadline) }}</p></div>
    </div>
  </div>
</template>
