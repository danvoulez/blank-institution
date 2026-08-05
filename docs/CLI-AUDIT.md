# Eve 0.30.6 CLI and runtime audit

The implementation was designed from the uploaded Eve 0.30.6 template and the framework source, not only from the Nuxt adapter.

## What the CLI revealed

### `/model` is control-plane behavior

The dev TUI intercepts `/model`; it is not sent as a user message. Its setup flow inspects the compiled app, selects a model/provider, edits authored source, and relies on the dev watcher to activate the change. The product therefore needs a control-plane surface in addition to chat.

Production role routing does **not** edit `agent.ts`. `agent/agent.ts` uses `defineDynamic` so authenticated session role selects the correct model at runtime.

### The official client is the headless session API

`eve/client` provides:

- one client bound to an Eve host and auth configuration;
- independent `ClientSession` handles;
- fresh or resumed sessions;
- per-request headers;
- `clientContext` and `outputSchema`;
- session ID and continuation token immediately after send;
- event streaming and aggregated results;
- health and compiled agent information;
- reset, clear, compact, and cancellation operations.

Nuxt uses this client in `server/utils/eve-control-plane.ts` to start Translator, Supervisor, and Executor sessions. There is no custom headless-session protocol.

### Dynamic capability composition is native

Eve 0.30.6 resolves these from durable session events:

- model;
- instructions;
- tools;
- Skills;
- subagents.

This project selects model, prompt, and tool authority from authenticated attributes:

```text
role · userId · intakeId · processId · assignmentId
```

Role is never trusted from user message text.

### Hooks are observers with durable identities

Hooks run after the event is durably recorded. Every event has a stable `meta.id`, while replayed attempts may emit new event IDs. The institution stores a runtime receipt plus an effect coordinate key, making projections and side effects idempotent without copying the entire Eve stream into a second event store.

Hooks do not decide the next responsible. Domain services validate the process head, checkpoint authority, Skill rules, and compare-and-set revision.

### Schedules already are the metabolism clock

A root Eve schedule is compiled to the deployment scheduler and can hand work to an authenticated channel. The Metabolism schedule first requests a deterministic database scan and directly enforces non-negotiable intake/assignment/sandbox liveness. A small model is invoked only for blocked-process recovery, deadlines, reminders, and escalation, and may select only permitted commands.

### Sandbox is already part of Eve

Executor instructions use Eve's built-in sandbox, shell, and file tools. The institution persists handoff artifacts in the dossier because independent role sessions cannot rely on another session's workspace.

## CLI capabilities promoted into the product

| CLI/runtime capability | Product surface |
|---|---|
| runtime model inspection | Settings → Runtime |
| dynamic model selection | authenticated role routing |
| `Client.session()` | asynchronous Supervisor/Executor sessions |
| continuation/reset/cancel primitives | process recovery and orphan cleanup |
| `health()` / `info()` | runtime operations endpoint and page |
| schedules | Metabolism |
| stream event hooks | runtime fact projection and recovery |
| sandbox/file tools | Executor work segment |
| connections | Executor capabilities such as Linear/GitHub |

## Deliberately not copied

- the TUI renderer;
- source-editing `/model` in production;
- another session transport;
- another stream format;
- another sandbox runtime;
- another scheduler;
- a generic workflow builder.
