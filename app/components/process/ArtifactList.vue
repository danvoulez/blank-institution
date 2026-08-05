<script setup lang="ts">
import type { ProcessArtifact } from "#shared/types/process";
defineProps<{ artifacts: ProcessArtifact[] }>();
</script>
<template>
  <div class="space-y-2">
    <article v-for="artifact in artifacts" :key="artifact.id" class="rounded-lg border border-default p-3">
      <div class="flex items-center justify-between gap-3">
        <p class="font-medium">{{ artifact.name }}</p>
        <span class="text-xs text-muted">{{ artifact.mimeType }}</span>
      </div>
      <pre v-if="artifact.inlineText" class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{{ artifact.inlineText }}</pre>
      <a v-else-if="artifact.externalUri" :href="artifact.externalUri" target="_blank" rel="noopener" class="mt-2 block text-sm text-primary">Open external artifact</a>
      <p class="mt-2 truncate font-mono text-[11px] text-dimmed">sha256:{{ artifact.digest }}</p>
    </article>
    <p v-if="!artifacts.length" class="text-sm text-muted">No artifacts yet.</p>
  </div>
</template>
