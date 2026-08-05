import { defineSchedule } from "eve/schedules";
import { internalHeaders, internalOrigin } from "../lib/internal-api.js";

// The tick itself lives server-side, behind POST /api/internal/metabolism/tick,
// because liveness has to be driven by an external timer: eve/nuxt does not
// compile schedules into the Nitro output, and `eve dev` never fires them on
// their cron cadence either.
//
// This file stays as the declaration of intended cadence and calls the same
// endpoint the timer calls, so there is one implementation of liveness. The
// lease makes an overlap between the two harmless rather than duplicated work.
export default defineSchedule({
  cron: process.env.METABOLISM_SCHEDULE || "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil((async () => {
      const response = await fetch(`${internalOrigin()}/api/internal/metabolism/tick?holder=eve-schedule`, {
        method: "POST",
        headers: internalHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Metabolism tick failed: ${response.status}`);
      }
      console.log("metabolism tick", await response.json());
    })());
  },
});
