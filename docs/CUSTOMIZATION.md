# Customization guide

The institution is customized through Process Skills, role routing, channels, and branding. The universal process loop should not be forked for each department.

## 1. Add or change a Process Skill

Create one package:

```text
agent/skills/<process-type>/
├── SKILL.md
└── process.json
```

`SKILL.md` is the operational playbook visible to the LLM roles. It should define the deliverable, stage expectations, evidence, review behavior, and limitations.

`process.json` is the mechanical contract used by the server and UI:

- allowed/default type owner;
- allowed/default responsible;
- allowed/default deadline classes;
- mandatory opening fields;
- stages and required capabilities;
- decisions permitted at review;
- accepted closure requirement.

After adding or modifying a package:

```bash
pnpm process:generate
pnpm test:process
```

The generator validates every manifest and writes `shared/generated/process-types.ts`. A new type requires no process-engine code and no database migration.

## 2. Configure the hierarchy's models

Set environment defaults in `.env`, then use Settings → Runtime for persistent routing changes that should apply to new sessions.

- Translator: premium synchronous/live model.
- Supervisor: premium asynchronous model.
- Executor: large local OpenAI-compatible model.
- Metabolism: small local OpenAI-compatible model.

The session role is authenticated server metadata, not prompt text. `agent/agent.ts` uses Eve `defineDynamic` to select the model. `agent/instructions.ts` and `agent/tools/process.ts` select the matching prompt and authority surface.

API keys remain environment variables. The Runtime page never returns or stores them.

## 3. Change institutional identity

Edit:

- `shared/agent.ts` for name, tagline, description, and icon;
- `app/app.config.ts` for site metadata;
- `agent/lib/base-instructions.ts` for common institutional behavior;
- assets under `public/` for visual identity.

Do not rename Eve's technical directories, route names, session IDs, continuation tokens, or generated service.

## 4. Add capabilities

### Authored Eve tool

Add a file under `agent/tools/`. Keep institutional transition tools in the existing dynamic process tool surface so authority is role-scoped.

A capability that performs a sensitive write must enforce its own approval/authorization boundary; delegation to the Executor is not itself authorization.

### MCP connection

Add an Eve connection under `agent/connections/`, or mount an extension. Process Skills name required capabilities; the Executor uses only those needed for its work order.

The existing Linear connection is an outbound MCP **client**. The institution's inbound MCP server is the separate `/api/mcp` route.

### GitHub

The existing GitHub tools remain credential-aware and dynamically available through Vercel Connect.

## 5. Customize the human workflow

Human work and review are both represented by explicit assignments. Customize notification copy or add channels in:

```text
server/utils/process-notifications.ts
```

Keep the web process inbox canonical. External notification delivery must not be able to delete, complete, or silently mutate an assignment.

The human decision UI lives in:

```text
app/components/process/HumanActionPanel.vue
app/pages/processes/[id].vue
```

## 6. Customize API and MCP exposure

User-scoped tokens are created in Settings → API and stored only as salted hashes.

- Public process API: `/api/processes`
- MCP Streamable HTTP endpoint: `/api/mcp`

The adapters must continue to call the same `submitIntake` service and shared Zod schemas. Do not add an ingress-specific process path.

For internet-facing production, also configure platform/WAF rate limiting and request-size limits appropriate to the deployment.

## 7. Slack

Configure the Slack connector identifier in `agent/channels/slack.ts` to match the provisioned Vercel Connect resource. Users link identities in Settings → Integrations.

Slack inbound messages create an intake before the first model call. Replies in the same Slack thread continue the linked active process.

## 8. Sendblue / iMessage

Configure the `SENDBLUE_*` variables documented in [Environment](./ENVIRONMENT.md). The webhook path is:

```text
/eve/v1/sendblue/webhook
```

iMessage associates a linked user's message with their active iMessage process; when none exists, it persists a new intake first. Structured checkpoint decisions are completed in the web process page.

## 9. Change the Metabolism policy

The deterministic candidate scan and command validation live in:

```text
server/utils/metabolism.ts
```

The schedule lives in:

```text
agent/schedules/metabolism.ts
```

The model may choose only the small `MetabolismAction` union. It must never alter an objective, accept delivery, or replace the type owner's judgment.

## 10. Deploy

On Vercel, keep the `eve/nuxt` module and allow it to generate stable services and routes. Do not restore the obsolete `experimentalServices` layout.

For a split non-Vercel deployment, point Nuxt to the Eve root origin with `EVE_NUXT_PRODUCTION_ORIGIN`, run Eve through its supported build/start path, and confirm the schedule runner is active.
