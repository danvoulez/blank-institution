# Implementation map

This map connects the institutional requirements to the concrete implementation.

## Hierarchy

| Requirement | Implementation |
|---|---|
| Human | Better Auth principal; web, Slack, iMessage, API, and MCP; `HumanActionPanel.vue` |
| Translator premium/live | dynamic role `translator`; `agent/agent.ts`, `agent/instructions.ts`, `agent/tools/process.ts` |
| Supervisor premium/async | official Eve Client role session; `server/utils/eve-control-plane.ts` |
| Executor local-large/async | role session with OpenAI-compatible model and Eve sandbox |
| Metabolism local-small/async | `agent/schedules/metabolism.ts` + dynamic `metabolism` role |

## Ingress before model execution

| Ingress | Intake creation |
|---|---|
| Web | `startChat()` → `/api/process-intakes` before `useEveAgent.send()` |
| Slack | `agent/channels/slack.ts` creates/reuses thread intake before returning the turn binding |
| iMessage | `agent/channels/sendblue.ts` creates intake or attaches active process before `send()` |
| API | `POST /api/processes` |
| MCP | `start_process` in `POST /api/mcp` |

All paths converge on `server/utils/process-intake.ts`.

## Mandatory opening checkpoint

- schema: `supervisorOpeningSchema` in `shared/schemas/process.ts`;
- Process Skill policy: `agent/skills/*/process.json`;
- transaction: `openProcess()` in `server/utils/processes.ts`;
- required fields: type owner, current responsible, concrete objective/criteria, deadline, Skill/version, initial work order;
- human-owner provisional opening: explicit `checkpoint_review` assignment before work starts.

## Work between checkpoints

- assignment claim/lease: `acceptAssignment()`;
- role session: official `eve/client`;
- sandbox/files/shell: native Eve tools, not wrapped by a second runtime;
- dossier: `process_artifacts` and `store_artifact`;
- submission: `submitWork()`;
- owner review assignment: explicit `checkpoint_review` for Supervisor or Human;
- decisions: return, reassign, escalate, complete, cancel, fail.

## 100% coverage and recovery

- every intake is persisted with idempotency key and attempt count;
- deterministic schedule retries stale intakes and expired assignments;
- exhausted intake budget becomes `failed` with reason and human notification;
- hooks project failure/waiting facts using stable Eve event IDs;
- failures create formal recovery checkpoints and owner review assignments;
- Metabolism interprets blocked processes and deadlines through a validated action union;
- Processes UI exposes failed intakes and manual recorded retry.

## Control plane promoted from the CLI

| Eve CLI/runtime capability | Product implementation |
|---|---|
| model/provider configuration concepts | Settings → Runtime + `process_role_models` |
| dynamic model selection | `defineDynamic` in `agent/agent.ts` |
| headless/durable session client | `server/utils/eve-control-plane.ts` |
| health/info | `/api/runtime` and Settings → Runtime |
| continuation/reset | persisted session cursors and orphan cleanup |
| schedules | deterministic + model-assisted Metabolism |
| stream hooks | `agent/hooks/process-observer.ts` |
| connections | existing GitHub and Linear capabilities |

## Extensibility test

A new process type is installed by adding only:

```text
agent/skills/<type>/SKILL.md
agent/skills/<type>/process.json
```

Then run `pnpm process:generate`. No process-loop TypeScript or database migration is required.
