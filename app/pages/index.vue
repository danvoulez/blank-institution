<script setup lang="ts">
import { startChat } from "~/composables/chat/navigation";

const input = ref("");

const greeting = computed(() => {
  const hour = new Date().getHours();
  let timeGreeting = "Good evening";
  if (hour < 12) timeGreeting = "Good morning";
  else if (hour < 18) timeGreeting = "Good afternoon";

  return timeGreeting;
});

function createChat(prompt: string) {
  const text = prompt.trim();
  if (!text) return;
  input.value = "";
  void startChat(text);
}

function onSubmit() {
  createChat(input.value);
}

const quickChats = [
  {
    label: "Deliver a concrete result",
    icon: "i-lucide-package-check",
    action: () => createChat("Start a generic delivery process. Help me define the concrete deliverable, acceptance criteria, responsible, and deadline."),
  },
  {
    label: "Show active processes",
    icon: "i-lucide-workflow",
    action: () => navigateTo("/processes"),
  },
  {
    label: "Explain how this works",
    icon: "i-lucide-circle-help",
    action: () => createChat("Explain the institution hierarchy, checkpoints, assignments, and how my request will be processed."),
  },
];
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <div class="hero-glow flex flex-1">
        <UContainer class="flex flex-1 flex-col justify-center gap-4 py-8 sm:gap-6">
          <div class="space-y-1">
            <h1 class="text-3xl font-bold text-highlighted sm:text-4xl">
              {{ greeting }}
            </h1>
            <p class="text-sm text-muted sm:text-base">
              Eve Institution — accountable work from intake to delivery
            </p>
          </div>

          <UChatPrompt
            v-model="input"
            class="[view-transition-name:chat-prompt]"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onSubmit"
          >
            <template #footer>
              <UChatPromptSubmit
                class="ms-auto shrink-0"
                color="neutral"
                size="sm"
              />
            </template>
          </UChatPrompt>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="quickChat in quickChats"
              :key="quickChat.label"
              :icon="quickChat.icon"
              :label="quickChat.label"
              size="sm"
              color="neutral"
              variant="outline"
              class="rounded-full"
              @click="quickChat.action()"
            />
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
