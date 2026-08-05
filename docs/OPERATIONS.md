# Operations

## Required services

- `web`: Nuxt UI, public/internal APIs, auth, process domain, SQLite/Turso.
- `eve`: Eve 0.30.6 runtime, channels, schedules, models, hooks, Skills, tools, sandbox.
- optional local inference host: OpenAI-compatible endpoints for Executor and Metabolism.

## Startup

```bash
pnpm install
pnpm process:generate
pnpm db:migrate
pnpm dev
```

Production Eve must run through an Eve-supported build/start path so schedules execute. The Vercel service build runs the Process Skill generator before `eve build`.

## Health

Open **Settings → Runtime**, or request:

```http
GET /api/runtime
```

This proxies the official Eve Client `health()` and `info()` calls and reports configured role routes without exposing API keys.

## Process coverage queries

These should remain zero outside short active windows:

```sql
select count(*)
from process_intakes
where status in ('received', 'translating', 'analyzing')
  and updated_at < unixepoch('subsecond') * 1000 - 600000;

select count(*)
from processes p
where p.status not in ('completed', 'cancelled', 'failed')
  and not exists (
    select 1 from process_assignments a
    where a.process_id = p.id
      and a.status in ('attempting', 'accepted', 'running', 'submitted')
  );
```

The schedule applies stale-intake retries, expired assignment retries, and orphan sandbox cleanup deterministically. Remaining blocked/deadline candidates are passed to the local-small Metabolism role for a validated recovery or escalation action.


## Failed intake handling

`INTAKE_ANALYSIS_MAX_ATTEMPTS` controls the automatic analysis retry budget (default `3`). Each attempt is persisted. When the budget is exhausted, the intake is marked `failed` with an explicit reason, the user is notified through available channels, and it appears under **Processes → Failed intakes**. The **Retry analysis** action creates another recorded attempt; it never erases the previous failure.

## Human notifications

The durable assignment in `/processes/:id` is canonical. On `request_human`, the server also attempts:

- Slack DM when a Slack account is linked and a bot token is available;
- iMessage when a phone is linked and Sendblue is configured.

Delivery failure does not delete or roll back the assignment; Metabolism retries reminders and the web inbox remains available.


## Security boundaries

- Browser-supplied `intakeId` and `processId` headers are accepted only after the Eve channel verifies ownership through the internal API.
- Internal role sessions require `INTERNAL_API_SECRET`; role, user, process, and assignment context are carried in authenticated session attributes rather than prompt text.
- API/MCP tokens are user-scoped, stored only as salted SHA-256 hashes, looked up by non-secret prefix, and revocable.
- Global model routing changes require an institution administrator in production. Provider API keys remain environment secrets and are never returned by Runtime Settings.
- Public rate limiting and WAF policy belong at the deployment edge; token authentication does not replace those controls.

## Adding a process type

1. Add `agent/skills/<id>/SKILL.md`.
2. Add and validate `agent/skills/<id>/process.json`.
3. Run `pnpm process:generate`.
4. Run the process tests.

No database migration or loop code change is required.

## API and MCP

Create a token in Settings → API. The raw token is shown once. Use it as:

```http
Authorization: Bearer evi_...
```

Public API: `/api/processes`
MCP Streamable HTTP endpoint: `/api/mcp`

## Local model failure

If a local endpoint is configured but unavailable, the affected role session fails through the normal Eve stream. The hook projects the failure, the process becomes blocked, and Metabolism can retry or escalate. It does not silently switch to a premium model because that would violate cost and authority expectations.
