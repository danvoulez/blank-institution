import { defineDynamic, defineInstructions } from "eve/instructions";
import type { DynamicResolveContext } from "eve/instructions";
import { BASE_INSTRUCTIONS, ROLE_INSTRUCTIONS } from "./lib/base-instructions.js";
import { buildUserContextPrompt, fetchUserContext } from "./lib/memory-internal.js";
import { buildInstitutionContext } from "./lib/process-internal.js";
import { institutionContext } from "./lib/role-context.js";

const IMESSAGE_INSTRUCTIONS = `# iMessage

This surface has no inline browser approval UI. Keep replies concise and link the user to the web process page for structured checkpoint decisions.`;

async function resolveInstructions(ctx: DynamicResolveContext) {
  const institution = institutionContext(ctx);
  const blocks = [BASE_INSTRUCTIONS, ROLE_INSTRUCTIONS[institution.role]];

  if (institution.role === "translator" && institution.userId) {
    const memory = await fetchUserContext(institution.userId).catch(() => null);
    if (memory) blocks.push(buildUserContextPrompt(memory));
  }

  const processContext = await buildInstitutionContext(institution);
  if (processContext) blocks.push(processContext);
  if (ctx.channel.kind === "sendblue") blocks.push(IMESSAGE_INSTRUCTIONS);

  return defineInstructions({ markdown: blocks.join("\n\n---\n\n") });
}

export default defineDynamic({
  events: {
    "session.started": (_event, ctx: DynamicResolveContext) => resolveInstructions(ctx),
    // The authenticated request may attach a process after the opening turn.
    // Re-resolve on every turn so the live Translator sees the current dossier.
    "turn.started": (_event, ctx: DynamicResolveContext) => resolveInstructions(ctx),
  },
});
