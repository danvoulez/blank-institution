# Eve Institution development guide

This repository is a complete process institution on Eve 0.30.6 and Nuxt 4.

## Commands

```bash
pnpm install
pnpm process:generate
pnpm db:migrate
pnpm dev
pnpm typecheck
pnpm test:process
```

Node.js 24+ is required by the project.

## Non-negotiable architecture

- Do not fork Eve or create a parallel agent/session/stream/sandbox/scheduler runtime.
- The four LLM roles are authenticated Eve sessions of one dynamic agent.
- Intake must exist before the first model call.
- All state transitions go through server domain functions and durable records.
- Hooks observe runtime events; they do not decide institutional authority.
- Process types are Skill packages: `SKILL.md + process.json`.
- Executor work uses Eve's built-in sandbox and file tools.
- Human assignments are durable even when external notification delivery fails.

## Main paths

- `agent/agent.ts`: dynamic model routing.
- `agent/instructions.ts`: role and dossier prompt composition.
- `agent/tools/process.ts`: role-specific authority/tool surface.
- `agent/hooks/process-observer.ts`: runtime fact projection.
- `agent/schedules/metabolism.ts`: liveness clock.
- `server/utils/processes.ts`: process/checkpoint/assignment transactions.
- `server/utils/eve-control-plane.ts`: official Eve Client sessions.
- `shared/types/process.ts`: domain contracts.
- `agent/skills/*`: Process Skills.
- `app/pages/processes/*`: operational UI.

Read `docs/CLI-AUDIT.md`, `docs/ARCHITECTURE.md`, and `VALIDATION.md` before changing runtime assumptions.
