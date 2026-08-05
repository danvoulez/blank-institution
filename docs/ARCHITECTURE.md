# Architecture

## Runtime topology

```text
Human / source system
  ├─ web chat
  ├─ Slack
  ├─ iMessage
  ├─ public API
  └─ MCP
          │
          ▼
Nuxt intake/domain service ─────────────── SQLite / Turso
          │                                intakes
          │ Eve Client                     processes
          ▼                                checkpoints
Eve dynamic root agent                    assignments
  ├─ Translator session (premium)          artifacts
  ├─ Supervisor session (premium)          API tokens
  ├─ Executor session (local large)         runtime receipts
  └─ Metabolism session (local small)
          │
          ├─ Eve stream + hooks
          ├─ Eve sandbox/files/shell
          ├─ Eve Skills
          └─ Eve connections
```

All four LLM roles are sessions of the same dynamically composed agent. This keeps one Eve deployment while allowing different models, prompts, tools, context, and authority.

## Authority boundaries

| Role | May do | May not do |
|---|---|---|
| Translator | normalize intake, report status, ask for missing context | execute work or accept delivery |
| Supervisor | select Skill, open process, review checkpoint, assign | execute the work segment |
| Executor | claim assignment, use sandbox/capabilities, store artifacts, submit | approve itself or choose successor |
| Metabolism | retry, resume, remind, escalate, clean orphan state | alter objective or accept delivery |
| Human | act as type owner, responsible, or approver when assigned | mutate another user's process |

Tools are dynamically omitted outside the authorized role. Server routes independently validate user, actor, current state, Skill policy, and process revision.

## Source of truth

- Eve stream: durable runtime execution evidence.
- `process_checkpoints`: institutional decisions.
- `process_assignments`: calls, claims, leases, work lifecycle.
- `process_artifacts`: durable handoff dossier.
- process row: current projection/head.
- cards and pages: human-readable projections.

There is no copied event store. `process_runtime_receipts` only prevents duplicate event effects and associates failures/waiting boundaries with institutional records.

## Atomic invariants

1. Intake is persisted before the first model call.
2. Intake analysis is terminally accountable: `converted`, or `failed` with reason and human escalation after the configured retry budget.
3. Opening is one transaction: process, opening checkpoint, first assignment, intake conversion.
4. Assignment claim is conditional on `status=attempting`.
5. Review is conditional on expected process revision.
6. Only one current responsible exists in the process projection.
7. Terminal processes cannot be resumed by normal transition code.
8. Human actors are canonicalized to the authenticated owner; LLM actors have canonical institution IDs.
9. A human type owner receives review work directly; the Supervisor cannot silently replace them.

## Process Skills

The filesystem package is the process type registry. The generated index solves the two-service boundary: Eve reads the Skill, while Nuxt and UI read the same generated mechanical manifest. No runtime CRUD table is needed.

## Recovery

- failures observed by hooks create recovery checkpoints and block the process;
- assignment leases expire deterministically;
- the Metabolism schedule deterministically enforces intake/assignment/sandbox invariants, then the local-small role applies a small allowed command union for interpretation-bearing recovery and escalation;
- `event.meta.id` and effect coordinates make hook projections idempotent;
- Eve continuation tokens and Client reset/cancel primitives are reused.
