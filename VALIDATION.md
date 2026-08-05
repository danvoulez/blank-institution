# Validation record

Validated on **2026-08-05** against the uploaded Personal Agent Template pinned to **Eve 0.30.6**.

## Source audit

The implementation was checked against Eve 0.30.6 CLI/runtime source, including:

- TUI `/model` control-plane flow;
- dynamic model, instructions, tools, Skills, and subagents;
- `eve/client` sessions, streams, snapshot, cancel, clear, compact, reset, `health()`, and `info()`;
- hook event envelopes and at-least-once semantics;
- schedules, Nuxt service generation, and sandbox behavior.

The obsolete `experimentalServices` deployment topology was removed. `eve/nuxt` owns stable service and `/eve/v1/**` route generation.

## Executed checks

### Process Skill generation

```bash
node scripts/generate-process-types.mjs
```

Result: **2 Process Skill manifests generated** (`generic-delivery`, `triage-review`).

### Domain tests

```bash
node --experimental-strip-types --test server/utils/process-machine.test.ts
```

Result: **5/5 tests passed**:

1. terminal process states have no outgoing transitions;
2. universal work → review → correction → closure cycle;
3. submitted assignments cannot be reclaimed;
4. every installed Process Skill requires the mandatory opening checkpoint;
5. generic delivery supports return, reassignment, and completion.

### TypeScript and Vue syntax

All TypeScript modules and every `<script>` block in Vue files were transpiled with TypeScript 5.8.3 using ES2022/ESNext settings.

Result: **217 scripts passed syntax validation**.

### Relative imports

Relative imports in `agent/`, `app/`, `server/`, and `shared/` were resolved against source files.

Result: **96 relative imports resolved; 0 missing**.

### JSON

All JSON files, including Process Skill manifests and Drizzle metadata, were parsed.

Result: **6 files parsed; 0 errors**.

### SQLite migrations

`0000_initial.sql` and `0001_institution.sql` were applied sequentially to an in-memory SQLite database.

Results:

- **18 tables created**;
- `process_intakes.analysis_attempts` and `last_attempt_at` exist with valid defaults;
- intake default state is `received`, attempt count is `1`;
- `(principal_id, idempotency_key)` uniqueness was enforced;
- API token prefix and runtime receipt indexes were created.

### Deployment/configuration checks

- `package.json` pins `eve` to exact `0.30.6`;
- the lockfile importer also specifies exact `0.30.6`;
- no legacy `vercel.json` is present;
- no weather tool/UI or daily-summary demo remains;
- README/documentation relative links resolve.

## Checks not executed in this environment

A full dependency installation, Nuxt typecheck, production build, and browser E2E run were **not** executed here because the available runtime is Node.js **22.16.0**, while this project requires Node.js **24+**, and the environment did not provide a usable pnpm installation/network-backed dependency refresh.

Run these in the target development environment:

```bash
corepack enable
pnpm install
pnpm process:generate
pnpm db:migrate
pnpm typecheck
pnpm test:process
pnpm build
```

Because `@ai-sdk/openai-compatible` was added while registry installation was unavailable, `frozen-lockfile=false` is set so the first real `pnpm install` refreshes package resolution metadata. Commit the refreshed `pnpm-lock.yaml` after that install.

## Required end-to-end acceptance

The system is not operationally accepted until the same complete loop passes from **chat, API, and MCP**:

```text
intake persisted
→ Translator
→ Supervisor
→ mandatory opening checkpoint
→ assignment claim
→ Executor or Human work
→ sandbox/dossier submission
→ owner checkpoint review
→ return and correction
→ accepted closure
→ Metabolism confirms no orphan intake/process/assignment
```

Also test restart/resume, failed child sessions, expired leases, failed-intake escalation, Slack/iMessage notification projection, token revocation, and a second Process Skill added without changing loop TypeScript.
