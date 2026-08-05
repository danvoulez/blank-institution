<script setup lang="ts">
import type { ProcessTypeManifest } from "#shared/types/process";
const { data, pending, error, refresh } = await useFetch<{ processTypes: ProcessTypeManifest[] }>("/api/process-types");
const types = computed(() => data.value?.processTypes ?? []);
</script>

<template>
  <UDashboardPanel id="process-types" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header><Navbar><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()" /></Navbar></template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl px-6 py-8">
        <header class="mb-8">
          <h1 class="mb-1 text-lg font-medium text-highlighted">Settings</h1>
          <p class="max-w-2xl text-sm text-muted">Inspect the Process Skills installed with the institution. Adding a type means adding a Skill package, not editing a workflow in the UI.</p>
        </header>
        <SettingsNav class="mb-8" />
        <UAlert v-if="error" color="error" variant="subtle" title="Could not load process types" :description="error.message" />
        <div v-else-if="pending" class="space-y-4"><USkeleton v-for="i in 2" :key="i" class="h-48 rounded-xl" /></div>
        <div v-else class="space-y-4">
          <article v-for="type in types" :key="`${type.id}@${type.version}`" class="rounded-xl border border-default bg-default p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">{{ type.name }}</h2>
                <p class="mt-1 text-sm text-muted">{{ type.description }}</p>
              </div>
              <UBadge color="neutral" variant="soft">{{ type.id }}@{{ type.version }}</UBadge>
            </div>
            <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt class="text-xs uppercase tracking-wide text-muted">Type owner</dt><dd class="mt-1 text-toned">{{ type.ownerPolicy.default }}</dd></div>
              <div><dt class="text-xs uppercase tracking-wide text-muted">Responsible</dt><dd class="mt-1 text-toned">{{ type.responsiblePolicy.default }}</dd></div>
              <div><dt class="text-xs uppercase tracking-wide text-muted">Deadline</dt><dd class="mt-1 text-toned">{{ type.deadlinePolicy.default }}</dd></div>
            </dl>
            <div class="mt-5 space-y-2">
              <h3 class="text-xs font-medium uppercase tracking-wide text-muted">Stages</h3>
              <div v-for="stage in type.stages" :key="stage.id" class="rounded-lg bg-elevated p-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium text-highlighted">{{ stage.title }}</span>
                  <UBadge color="neutral" variant="outline">{{ stage.responsible }}</UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">{{ stage.instructions }}</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
