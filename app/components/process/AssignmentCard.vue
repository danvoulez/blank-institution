<script setup lang="ts">
import type { ProcessAssignment } from "#shared/types/process";
import { actorLabel } from "~/utils/process";
defineProps<{ assignment: ProcessAssignment }>();
</script>
<template>
  <article class="rounded-lg border border-default p-4">
    <div class="flex items-center justify-between gap-3">
      <div><p class="font-medium">{{ actorLabel(assignment.assignee) }}</p><p class="text-xs capitalize text-muted">{{ assignment.purpose.replaceAll('_', ' ') }}</p></div>
      <UBadge color="neutral" variant="soft" class="capitalize">{{ assignment.status.replaceAll('_', ' ') }}</UBadge>
    </div>
    <dl class="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
      <div><dt class="text-xs uppercase">Attempt</dt><dd>{{ assignment.attempt }}</dd></div>
      <div><dt class="text-xs uppercase">Accept by</dt><dd>{{ new Date(assignment.acceptDeadlineAt).toLocaleString() }}</dd></div>
      <div v-if="assignment.childSessionId"><dt class="text-xs uppercase">Eve session</dt><dd class="truncate font-mono text-xs">{{ assignment.childSessionId }}</dd></div>
      <div v-if="assignment.leaseExpiresAt"><dt class="text-xs uppercase">Lease</dt><dd>{{ new Date(assignment.leaseExpiresAt).toLocaleString() }}</dd></div>
    </dl>
    <p v-if="assignment.feedback" class="mt-3 whitespace-pre-wrap text-sm">{{ assignment.feedback }}</p>
  </article>
</template>
