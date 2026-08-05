import { defineDynamic, defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { MEMORY_CATEGORIES } from "../lib/memory-categories.js";
import { saveMemoryRemote } from "../lib/memory-internal.js";
import { institutionContext } from "../lib/role-context.js";

const updateSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().min(1),
});

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      const institution = institutionContext(ctx);
      if (institution.role !== "translator" || !institution.userId) return null;
      return defineTool({
        description: "Propose long-term user memory updates. This is user context, never institutional process state.",
        inputSchema: z.object({ reason: z.string().min(1), updates: z.array(updateSchema).min(1).max(5) }),
        approval: always(),
        async execute({ updates }) {
          const results = [];
          for (const update of updates) {
            results.push(await saveMemoryRemote({ userId: institution.userId!, category: update.category, content: update.content }));
          }
          return { results };
        },
      });
    },
  },
});
