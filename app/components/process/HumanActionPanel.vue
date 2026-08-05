<script setup lang="ts">
import type { ActorRef, DeadlineClass, ProcessDetail, WorkOrder } from "#shared/types/process";

const props = defineProps<{ detail: ProcessDetail }>();
const emit = defineEmits<{ changed: [] }>();
const current = computed(() => [...props.detail.assignments].reverse().find(item => ["attempting", "accepted", "running", "submitted"].includes(item.status)));
const currentCheckpoint = computed(() => current.value ? props.detail.checkpoints.find(item => item.id === current.value?.checkpointId) : undefined);
const feedback = ref("");
const reviewDecision = ref<"return" | "reassign" | "escalate" | "complete" | "cancel" | "fail">("complete");
const busy = ref(false);
const errorMessage = ref<string>();
const isHumanResponsible = computed(() => current.value?.assignee.kind === "human");
const isOpeningReview = computed(() => current.value?.purpose === "checkpoint_review" && currentCheckpoint.value?.kind === "opening" && currentCheckpoint.value.status === "pending");
const isRecoveryReview = computed(() => current.value?.purpose === "checkpoint_review" && currentCheckpoint.value?.kind === "recovery" && currentCheckpoint.value.status === "pending");

const ownerKind = ref<"supervisor" | "human">("human");
const responsibleKind = ref<"executor" | "human">("executor");
const deliverable = ref("");
const criteriaText = ref("");
const deadlineClass = ref<DeadlineClass>("24h");
const dueAtLocal = ref("");
const workObjective = ref("");
const capabilitiesText = ref("");

watchEffect(() => {
  const detail = props.detail;
  ownerKind.value = detail.process.typeOwner.kind === "human" ? "human" : "supervisor";
  responsibleKind.value = detail.process.currentResponsible.kind === "human" ? "human" : "executor";
  deliverable.value ||= detail.process.objective.deliverable;
  criteriaText.value ||= detail.process.objective.acceptanceCriteria.join("\n");
  deadlineClass.value = detail.process.deadline.class;
  if (!dueAtLocal.value) {
    const date = new Date(detail.process.deadline.dueAt);
    dueAtLocal.value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  workObjective.value ||= currentCheckpoint.value?.workOrder?.objective ?? detail.process.objective.deliverable;
  capabilitiesText.value ||= currentCheckpoint.value?.workOrder?.requiredCapabilities.join("\n") ?? "";
});

function lines(value: string) {
  return value.split("\n").map(item => item.trim()).filter(Boolean);
}

function actor(kind: "supervisor" | "human" | "executor"): ActorRef {
  return kind === "human"
    ? { kind: "human", id: props.detail.process.userId }
    : { kind: "llm", role: kind, id: `institution:${kind}` };
}

function workOrder(): WorkOrder {
  return {
    objective: workObjective.value.trim() || deliverable.value.trim(),
    acceptanceCriteria: lines(criteriaText.value),
    requiredCapabilities: lines(capabilitiesText.value),
    stageId: currentCheckpoint.value?.workOrder?.stageId,
  };
}

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  errorMessage.value = undefined;
  try {
    await action();
    feedback.value = "";
    emit("changed");
  } catch (cause) {
    errorMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function accept() {
  if (!current.value) return;
  await run(() => $fetch(`/api/assignments/${current.value!.id}/accept`, { method: "POST" }));
}

async function submit() {
  if (!current.value || !feedback.value.trim()) return;
  await run(() => $fetch(`/api/assignments/${current.value!.id}/submit`, {
    method: "POST",
    body: {
      processId: props.detail.process.id,
      summary: feedback.value,
      result: { humanSubmission: feedback.value },
      artifactIds: [],
      limitations: [],
    },
  }));
}

async function decideOpening(decision: "accept" | "cancel" | "fail") {
  if (!current.value || !currentCheckpoint.value) return;
  await run(() => $fetch(`/api/checkpoints/${currentCheckpoint.value!.id}/decision`, {
    method: "POST",
    body: {
      expectedRevision: props.detail.process.revision,
      decision,
      feedback: feedback.value || undefined,
      typeOwner: actor(ownerKind.value),
      currentResponsible: actor(responsibleKind.value),
      objective: {
        deliverable: deliverable.value.trim(),
        acceptanceCriteria: lines(criteriaText.value),
      },
      deadline: {
        class: deadlineClass.value,
        dueAt: dueAtLocal.value ? new Date(dueAtLocal.value).getTime() : undefined,
      },
      workOrder: workOrder(),
    },
  }));
}


async function recover() {
  if (!current.value || !currentCheckpoint.value) return;
  const decision = reviewDecision.value === "reassign" ? "reassign" : reviewDecision.value === "cancel" ? "cancel" : reviewDecision.value === "fail" ? "fail" : "return";
  await run(() => $fetch(`/api/checkpoints/${currentCheckpoint.value!.id}/decision`, {
    method: "POST",
    body: {
      expectedRevision: props.detail.process.revision,
      decision,
      feedback: feedback.value || "Retry the interrupted responsibility using the recorded work order.",
      ...(decision === "reassign" ? { nextResponsible: actor(responsibleKind.value), workOrder: workOrder() } : {}),
    },
  }));
}

async function review() {
  const checkpoint = props.detail.checkpoints.at(-1);
  if (!checkpoint) return;
  const sourceWorkOrder = current.value
    ? props.detail.checkpoints.find(item => item.id === current.value?.checkpointId)?.workOrder
    : undefined;
  const needsNext = reviewDecision.value === "reassign" || reviewDecision.value === "escalate";
  await run(() => $fetch(`/api/checkpoints/${checkpoint.id}/decision`, {
    method: "POST",
    body: {
      expectedRevision: props.detail.process.revision,
      decision: reviewDecision.value,
      feedback: feedback.value || undefined,
      ...(reviewDecision.value === "return" ? { workOrder: sourceWorkOrder } : {}),
      ...(needsNext ? {
        nextResponsible: actor(responsibleKind.value),
        workOrder: sourceWorkOrder ?? workOrder(),
      } : {}),
    },
  }));
}
</script>

<template>
  <section v-if="current && isHumanResponsible" class="rounded-xl border border-primary/30 bg-primary/5 p-4">
    <h2 class="font-semibold">Human checkpoint</h2>
    <p class="mt-1 text-sm text-muted">{{ isOpeningReview ? 'The process is provisional. Work cannot start until this opening checkpoint is accepted.' : isRecoveryReview ? 'A runtime failure created a formal recovery checkpoint.' : 'This is a persisted assignment with an explicit deadline.' }}</p>
    <UAlert v-if="errorMessage" class="mt-3" color="error" variant="subtle" title="Action failed" :description="errorMessage" />

    <div v-if="isHumanResponsible && current.status === 'attempting'" class="mt-4">
      <UButton label="Accept assignment" :loading="busy" @click="accept" />
    </div>

    <div v-else-if="isOpeningReview && current.status === 'accepted'" class="mt-4 space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Type owner"><USelect v-model="ownerKind" :items="['human', 'supervisor']" class="w-full" /></UFormField>
        <UFormField label="Current responsible"><USelect v-model="responsibleKind" :items="['executor', 'human']" class="w-full" /></UFormField>
        <UFormField label="Concrete deliverable" class="md:col-span-2"><UTextarea v-model="deliverable" class="w-full" /></UFormField>
        <UFormField label="Acceptance criteria" description="One per line" class="md:col-span-2"><UTextarea v-model="criteriaText" class="w-full" /></UFormField>
        <UFormField label="Deadline class"><USelect v-model="deadlineClass" :items="['urgent', '24h', '1w', '1m']" class="w-full" /></UFormField>
        <UFormField label="Due at"><UInput v-model="dueAtLocal" type="datetime-local" class="w-full" /></UFormField>
        <UFormField label="First work order" class="md:col-span-2"><UTextarea v-model="workObjective" class="w-full" /></UFormField>
        <UFormField label="Required capabilities" description="One per line" class="md:col-span-2"><UTextarea v-model="capabilitiesText" class="w-full" /></UFormField>
      </div>
      <UTextarea v-model="feedback" placeholder="Opening findings or corrections applied" class="w-full" />
      <div class="flex flex-wrap gap-2">
        <UButton label="Accept and start work" :loading="busy" @click="decideOpening('accept')" />
        <UButton label="Cancel process" color="neutral" variant="outline" :loading="busy" @click="decideOpening('cancel')" />
        <UButton label="Fail intake" color="error" variant="soft" :loading="busy" @click="decideOpening('fail')" />
      </div>
    </div>

    <div v-else-if="isRecoveryReview && current.status === 'accepted'" class="mt-4 space-y-3">
      <div class="flex flex-wrap gap-3">
        <USelect v-model="reviewDecision" :items="['return', 'reassign', 'cancel', 'fail']" class="w-48" />
        <USelect v-if="reviewDecision === 'reassign'" v-model="responsibleKind" :items="['executor', 'human']" class="w-48" />
      </div>
      <UTextarea v-model="feedback" placeholder="Recovery reason and instructions" class="w-full" />
      <UButton label="Apply recovery decision" :loading="busy" @click="recover" />
    </div>

    <div v-else-if="isHumanResponsible && current.purpose === 'work' && ['accepted', 'running'].includes(current.status)" class="mt-4 space-y-3">
      <UTextarea v-model="feedback" placeholder="Describe the completed work and result" class="w-full" />
      <UButton label="Submit work" :loading="busy" @click="submit" />
    </div>

    <div v-else-if="current.purpose === 'checkpoint_review' && current.status === 'accepted'" class="mt-4 space-y-3">
      <div class="flex flex-wrap gap-3">
        <USelect v-model="reviewDecision" :items="['complete', 'return', 'reassign', 'escalate', 'cancel', 'fail']" class="w-48" />
        <USelect v-if="reviewDecision === 'reassign' || reviewDecision === 'escalate'" v-model="responsibleKind" :items="['executor', 'human']" class="w-48" />
      </div>
      <UTextarea v-model="feedback" placeholder="Findings or requested corrections" class="w-full" />
      <UButton label="Apply checkpoint decision" :loading="busy" @click="review" />
    </div>
  </section>
</template>
