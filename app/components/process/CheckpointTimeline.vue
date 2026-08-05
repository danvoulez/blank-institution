<script setup lang="ts">
import type { ProcessCheckpoint } from "#shared/types/process";
import { actorLabel } from "~/utils/process";
defineProps<{ checkpoints: ProcessCheckpoint[] }>();
</script>
<template>
  <div class="space-y-3">
    <article v-for="checkpoint in checkpoints" :key="checkpoint.id" class="rounded-lg border border-default p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-medium capitalize">#{{ checkpoint.sequence }} · {{ checkpoint.kind }} · {{ checkpoint.decision ?? checkpoint.status }}</p>
        <div class="flex items-center gap-2"><UBadge v-if="checkpoint.status === 'pending'" color="warning" variant="soft">Pending</UBadge><time class="text-xs text-muted">{{ new Date(checkpoint.createdAt).toLocaleString() }}</time></div>
      </div>
      <p class="mt-1 text-sm text-muted">Reviewer: {{ actorLabel(checkpoint.reviewer) }}</p>
      <div v-if="checkpoint.review" class="mt-3 space-y-2 text-sm">
        <p v-for="finding in checkpoint.review.findings" :key="finding">{{ finding }}</p>
        <ul v-if="checkpoint.review.requestedCorrections.length" class="list-disc space-y-1 pl-5 text-warning">
          <li v-for="item in checkpoint.review.requestedCorrections" :key="item">{{ item }}</li>
        </ul>
      </div>
      <pre v-if="checkpoint.workOrder" class="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{{ JSON.stringify(checkpoint.workOrder, null, 2) }}</pre>
    </article>
  </div>
</template>
