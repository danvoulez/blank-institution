import type { RuntimeFact } from "./types/process";

// Eve delivers hook events at least once, and a step interrupted mid-execution
// re-runs and re-emits its events under new ids. The receipts table therefore
// gates side effects on an effect key rather than on the event id.
//
// Which key depends on the event's scope:
//
// - Step-scoped events carry turn coordinates. A retry restores those from the
//   step input, so the second attempt hashes to the same key and the gate
//   holds — this is the case the ledger exists for.
//
// - Session-scoped boundaries (session.waiting, session.failed) carry no
//   coordinates at all. A session parks once per turn, so each emission is a
//   distinct occurrence rather than a retry of the previous one, and they must
//   key on the event id. True redelivery of one persisted event is still
//   rejected by the receipts primary key.
//
// Keying is structural rather than a delimiter-joined string: a positional
// join loses which coordinate a value came from once absent ones are dropped,
// so {turnId: "1"} and {stepIndex: 1} collapse onto the same key.
export function effectKeyInput(fact: RuntimeFact): Record<string, unknown> {
  const coordinates = {
    turnId: fact.turnId,
    stepIndex: fact.stepIndex,
    sequence: fact.sequence,
    callId: fact.callId,
  };
  const stepScoped = Object.values(coordinates).some(value => value !== undefined);

  return stepScoped
    ? { sessionId: fact.sessionId, eventType: fact.eventType, ...coordinates }
    : { sessionId: fact.sessionId, eventType: fact.eventType, eventId: fact.eventId };
}
