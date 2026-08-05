# Eve Institution

A complete process institution built directly on the Personal Agent Template and **Eve 0.30.6**.

This is not a reduced workflow demo. The first accepted system contains the complete hierarchy, all three ingress paths, mandatory opening checkpoints, asynchronous execution, human work, review, recovery, persistence, and operational UI.

## Hierarchy

| Level | Runtime implementation | Mode |
|---|---|---|
| Human | Better Auth user; web, Slack, iMessage, API, MCP | synchronous or asynchronous |
| LLM Translator | Root Eve agent role selected per session | premium, live |
| LLM Supervisor | Independent Eve role session started through `eve/client` | premium, asynchronous |
| LLM Executor | Independent Eve role session with built-in sandbox | local large model, asynchronous |
| Metabolism | Eve schedule + independent role session | local small model, asynchronous |

The roles use one dynamically configured Eve agent. `defineDynamic` selects model, instructions, tools, and authority from authenticated session attributes. The Nuxt service starts and resumes role sessions with Eve's official `Client`; it does not implement another agent runtime.

## Universal process loop

```text
API | MCP | web | Slack | iMessage
              ↓
       persisted intake
              ↓
       Translator session
              ↓
       Supervisor session
              ↓
 mandatory opening checkpoint
 owner · responsible · objective · deadline · Skill · work order
              ↓
 assignment attempt → accept/claim → work in sandbox → submission
              ↓
 checkpoint review
 complete | return | reassign | escalate | cancel | fail
              ↓
        repeat or close
```

Every intake must end as either:

- `converted` with a `processId`; or
- `failed` with an explicit reason.

The Metabolism schedule deterministically enforces stale-intake retries, expired assignment claims/leases, and orphan sandbox cleanup; the local-small Metabolism role interprets blocked-process recovery, deadlines, reminders, and escalation. Intake analysis is retried up to `INTAKE_ANALYSIS_MAX_ATTEMPTS`; exhaustion becomes an explicit failed intake with human escalation and a manual retry action in the Processes page.

## What is reused from Eve and the template

- durable sessions, continuation tokens, streams, cancellation, reset, and compaction;
- dynamic models, instructions, tools, Skills, and role surfaces;
- official server-to-server `Client` with `health()` and `info()`;
- built-in sandbox, shell, and file tools;
- schedules and production cron generation;
- hooks with durable event metadata;
- web chat, Slack, iMessage, Better Auth, SQLite/Turso, Drizzle, GitHub, Linear MCP, and approval UI.

The added institutional domain is limited to intake, process, checkpoint, assignment, dossier/artifact, API token, and runtime receipt records.

## Ingress

### Official chat

Web, Slack, and iMessage persist an intake **before the first model call**. The intake identifier is attached to authenticated Eve session context.

### Public API

```http
POST /api/processes
Authorization: Bearer evi_...
Content-Type: application/json

{
  "rawRequest": "Produce the requested deliverable...",
  "idempotencyKey": "source-system:request-123",
  "requestedSkillId": "generic-delivery"
}
```

### MCP server

`POST /api/mcp`, authenticated with the same user-scoped bearer token. Tools:

- `start_process`
- `get_process`
- `list_processes`
- `respond_to_checkpoint`
- `get_process_timeline`

Tokens are created under **Settings → API**.

## Process Skills

```text
agent/skills/<process-type>/
├── SKILL.md
└── process.json
```

`SKILL.md` teaches the roles. `process.json` contains mechanical owner, responsible, deadline, stage, capability, review, and closure rules. `pnpm process:generate` builds the shared manifest index used by Eve, Nuxt, APIs, and UI.

Two complete types ship with the project:

- `generic-delivery`
- `triage-review`

## Local model configuration

```dotenv
TRANSLATOR_MODEL=anthropic/claude-sonnet-4.6
SUPERVISOR_MODEL=anthropic/claude-opus-4.6

EXECUTOR_MODEL=your-large-local-model
EXECUTOR_BASE_URL=http://gpu-host:8000/v1
EXECUTOR_API_KEY=local
EXECUTOR_CONTEXT_WINDOW_TOKENS=131072

METABOLISM_MODEL=your-small-local-model
METABOLISM_BASE_URL=http://gpu-host:8000/v1
METABOLISM_API_KEY=local
METABOLISM_CONTEXT_WINDOW_TOKENS=32768
```

When a local base URL is present, the role selects an OpenAI-compatible AI SDK model at `step.started`. Otherwise it falls back to a serializable gateway model ID selected at `session.started`.

## Run

Requirements: Node.js 24+, pnpm 9.15.

```bash
pnpm install
cp .env.example .env
pnpm process:generate
pnpm db:migrate
pnpm dev
```

Open the web app, create an account, and use chat or **Processes**. Use **Settings → Runtime** to inspect the same Eve runtime health, compiled agent information, and model routing concepts exposed by the CLI.

## Documentation

- [CLI audit](docs/CLI-AUDIT.md)
- [Implementation map](docs/IMPLEMENTATION-MAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations](docs/OPERATIONS.md)
- [Environment](docs/ENVIRONMENT.md)
- [Validation record](VALIDATION.md)

## License

MIT. Derived from the Vercel Labs Personal Agent Template; Eve remains an external dependency and runtime.
