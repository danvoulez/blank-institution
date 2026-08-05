import { z } from "zod";
import { workSubmissionSchema } from "#shared/schemas/process";
import { requireInternalRequest } from "~~/server/utils/internal-api";
import { submitWork } from "~~/server/utils/processes";
import { executeNextAction } from "~~/server/utils/eve-control-plane";
const bodySchema = z.object({ userId: z.string().min(1), submission: workSubmissionSchema });
export default defineEventHandler(async (event) => {
  requireInternalRequest(event);
  const body = await readValidatedBody(event, bodySchema.parse);
  const result = await submitWork(body.userId, body.submission);
  await executeNextAction(result.nextAction);
  return result;
});
