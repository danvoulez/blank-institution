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

## Liveness

Nothing inside the app fires on a cadence. `eve/nuxt` mounts the agent routes
but does not compile `agent/schedules/` into the Nitro build, and `eve dev`
never fires schedules on their cron cadence either. Liveness is therefore
driven from outside, by `launchd` on the host that runs the institution.

```bash
cp scripts/work.minilab.institution.metabolism.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/work.minilab.institution.metabolism.plist
```

Edit the paths in the plist first: the checkout, and the env file holding
`INTERNAL_API_SECRET`.

The timer calls one endpoint:

```
POST /api/internal/metabolism/tick
```

It takes a lease before doing anything, so a manual trigger landing on top of a
scheduled one is safe — the second call reports the lease and returns. Firing it
by hand to check:

```bash
sh scripts/metabolism-tick.sh .env
```

Each tick runs the deterministic sweep first — intake retry budgets, expired
claims, orphan sandboxes — and only then asks the Metabolism model about what
is left. Those are invariants, not judgments, so they never depend on a model
being reachable.

### Prompt budget

The Metabolism model runs with its context split across slots, so the usable
window is a fraction of the model's nominal context. The tick projects each
process down to id, status, idle minutes, minutes to deadline and who owes
work, sorts by urgency, and fills the budget until it is spent. What does not
fit is reported as `omitted` and appears on a later tick.

If not even one record fits, the tick logs and dispatches nothing. A liveness
decision taken on a silently truncated view is worse than no decision.

Set `METABOLISM_CONTEXT_WINDOW_TOKENS` to what the endpoint actually reports:

```bash
curl -s http://127.0.0.1:8392/v1/models | grep -o '"n_ctx":[0-9]*'
```
