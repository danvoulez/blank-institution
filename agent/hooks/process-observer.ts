import { defineHook } from "eve/hooks";
import { appOrigin, internalHeaders } from "../lib/internal-api.js";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const data = "data" in event ? event.data : undefined;
      const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
      try {
        await fetch(`${appOrigin()}/api/internal/runtime/event`, {
          method: "POST",
          headers: internalHeaders(),
          body: JSON.stringify({
            eventId: event.meta.id,
            eventType: event.type,
            sessionId: ctx.session.id,
            occurredAt: new Date(event.meta.at).toISOString(),
            turnId: typeof record.turnId === "string" ? record.turnId : undefined,
            stepIndex: typeof record.stepIndex === "number" ? record.stepIndex : undefined,
            sequence: typeof record.sequence === "number" ? record.sequence : undefined,
            callId: typeof record.callId === "string" ? record.callId : undefined,
            data,
          }),
        });
      } catch (error) {
        // Hooks are at-least-once observers. A failed projection must not destroy
        // the Eve turn; Metabolism independently scans for orphaned work.
        console.error("process runtime projection failed", {
          eventId: event.meta.id,
          type: event.type,
          sessionId: ctx.session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  },
});
