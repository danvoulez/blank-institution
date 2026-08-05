import { z } from "zod";
import { submitIntakeSchema, humanDecisionSchema, processListQuerySchema, workSubmissionSchema } from "#shared/schemas/process";
import type { SupervisorReviewDecision } from "#shared/types/process";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import { authenticateProcessApiToken } from "~~/server/utils/process-api-tokens";
import { submitIntake } from "~~/server/utils/process-intake";
import { launchTranslatorForIntake, executeNextAction } from "~~/server/utils/eve-control-plane";
import { acceptAssignment, applyOpeningCheckpointDecision, applyRecoveryDecision, applyReviewDecision, getProcessDetailForUser, listProcessesForUser, submitWork } from "~~/server/utils/processes";

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const toolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

function result(id: string | number | null | undefined, value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

function error(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function textContent(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

const tools = [
  {
    name: "start_process",
    description: "Persist an intake and start the Translator/Supervisor process loop.",
    inputSchema: {
      type: "object",
      properties: {
        rawRequest: { type: "string" },
        idempotencyKey: { type: "string" },
        requestedSkillId: { type: "string" },
      },
      required: ["rawRequest", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    name: "get_process",
    description: "Get a process, checkpoints, assignments and dossier.",
    inputSchema: { type: "object", properties: { processId: { type: "string", format: "uuid" } }, required: ["processId"], additionalProperties: false },
  },
  {
    name: "list_processes",
    description: "List processes owned by the token user.",
    inputSchema: { type: "object", properties: { status: { type: "string" }, skillId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "accept_assignment",
    description: "Accept a human work or checkpoint-review assignment.",
    inputSchema: { type: "object", properties: { assignmentId: { type: "string", format: "uuid" } }, required: ["assignmentId"], additionalProperties: false },
  },
  {
    name: "submit_human_work",
    description: "Submit a human work assignment to its type owner for review.",
    inputSchema: {
      type: "object",
      properties: {
        processId: { type: "string", format: "uuid" },
        assignmentId: { type: "string", format: "uuid" },
        summary: { type: "string" },
        result: {},
        artifactIds: { type: "array", items: { type: "string", format: "uuid" } },
        limitations: { type: "array", items: { type: "string" } },
        recommendedNextAction: { type: "string" },
      },
      required: ["processId", "assignmentId", "summary", "result"],
      additionalProperties: false,
    },
  },
  {
    name: "respond_to_checkpoint",
    description: "Apply a human checkpoint decision to a submitted assignment.",
    inputSchema: {
      type: "object",
      properties: {
        processId: { type: "string", format: "uuid" },
        assignmentId: { type: "string", format: "uuid" },
        expectedRevision: { type: "integer", minimum: 0 },
        decision: { type: "string", enum: ["accept", "return", "reassign", "escalate", "complete", "cancel", "fail"] },
        feedback: { type: "string" },
        nextResponsible: { type: "object" },
        workOrder: { type: "object" },
        typeOwner: { type: "object" },
        currentResponsible: { type: "object" },
        objective: { type: "object" },
        deadline: { type: "object" },
      },
      required: ["processId", "assignmentId", "expectedRevision", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "get_process_timeline",
    description: "Return the institutional timeline derived from checkpoints and assignments.",
    inputSchema: { type: "object", properties: { processId: { type: "string", format: "uuid" } }, required: ["processId"], additionalProperties: false },
  },
];

export default defineEventHandler(async (event) => {
  const userId = await authenticateProcessApiToken(event);
  const request = rpcSchema.parse(await readBody(event));
  setResponseHeader(event, "content-type", "application/json");

  try {
    switch (request.method) {
      case "initialize":
        return result(request.id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "eve-institution", version: "0.30.6" },
        });
      case "notifications/initialized":
        setResponseStatus(event, 202);
        return null;
      case "ping":
        return result(request.id, {});
      case "tools/list":
        return result(request.id, { tools });
      case "tools/call": {
        const call = toolCallSchema.parse(request.params);
        return result(request.id, await callTool(userId, call.name, call.arguments));
      }
      default:
        return error(request.id, -32601, `Method not found: ${request.method}`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return error(request.id, -32000, message);
  }
});

async function callTool(userId: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "start_process": {
      const input = submitIntakeSchema.parse(args);
      const { intake, created } = await submitIntake({
        principalId: userId,
        source: "mcp",
        rawRequest: input.rawRequest,
        idempotencyKey: input.idempotencyKey,
        requestedSkillId: input.requestedSkillId,
      });
      const session = created ? await launchTranslatorForIntake({
        intakeId: intake.id,
        userId,
        rawRequest: intake.rawRequest,
        requestedSkillId: intake.requestedSkillId,
      }) : undefined;
      return textContent({ intakeId: intake.id, processId: intake.processId, sessionId: session?.sessionId ?? intake.rootSessionId, status: intake.status });
    }
    case "get_process":
    case "get_process_timeline": {
      const { processId } = z.object({ processId: z.string().uuid() }).parse(args);
      const detail = await getProcessDetailForUser(userId, processId);
      if (!detail) throw new Error("Process not found");
      return textContent(detail);
    }
    case "list_processes": {
      const query = processListQuerySchema.parse(args);
      return textContent({ processes: await listProcessesForUser({ userId, ...query }) });
    }
    case "accept_assignment": {
      const { assignmentId } = z.object({ assignmentId: z.string().uuid() }).parse(args);
      return textContent(await acceptAssignment({ userId, assignmentId, actor: { kind: "human", id: userId } }));
    }
    case "submit_human_work": {
      const submission = workSubmissionSchema.parse(args);
      const applied = await submitWork(userId, submission);
      await executeNextAction(applied.nextAction);
      return textContent(applied);
    }
    case "respond_to_checkpoint": {
      const parsed = z.object({
        processId: z.string().uuid(),
        assignmentId: z.string().uuid(),
      }).and(humanDecisionSchema).parse(args);
      const [assignment] = await db.select().from(schema.processAssignments).where(and(
        eq(schema.processAssignments.id, parsed.assignmentId),
        eq(schema.processAssignments.processId, parsed.processId),
      )).limit(1);
      if (!assignment) throw new Error("Assignment not found");
      const [checkpoint] = await db.select().from(schema.processCheckpoints).where(eq(schema.processCheckpoints.id, assignment.checkpointId)).limit(1);
      if (!checkpoint) throw new Error("Checkpoint not found");

      if (assignment.purpose === "checkpoint_review" && checkpoint.kind === "opening" && checkpoint.status === "pending") {
        if (!["accept", "reassign", "cancel", "fail"].includes(parsed.decision)) throw new Error("Invalid opening decision");
        const applied = await applyOpeningCheckpointDecision({
          userId,
          checkpointId: checkpoint.id,
          assignmentId: assignment.id,
          reviewer: { kind: "human", id: userId },
          expectedRevision: parsed.expectedRevision,
          decision: parsed.decision as "accept" | "reassign" | "cancel" | "fail",
          feedback: parsed.feedback,
          typeOwner: parsed.typeOwner,
          currentResponsible: parsed.currentResponsible ?? parsed.nextResponsible,
          objective: parsed.objective,
          deadline: parsed.deadline,
          workOrder: parsed.workOrder,
        });
        await executeNextAction(applied.nextAction);
        return textContent(applied);
      }

      if (assignment.purpose !== "checkpoint_review" || assignment.status !== "accepted") {
        throw new Error("Pass an accepted checkpoint-review assignment to respond_to_checkpoint");
      }
      const reviewAssignmentId = assignment.id;

      if (checkpoint.kind === "recovery" && checkpoint.status === "pending") {
        if (!["return", "reassign", "cancel", "fail"].includes(parsed.decision)) throw new Error("Invalid recovery decision");
        const applied = await applyRecoveryDecision({
          userId,
          reviewer: { kind: "human", id: userId },
          reviewAssignmentId,
          decision: {
            processId: parsed.processId,
            expectedRevision: parsed.expectedRevision,
            decision: parsed.decision as "return" | "reassign" | "cancel" | "fail",
            feedback: parsed.feedback || "Recovery decision applied through MCP.",
            nextResponsible: parsed.nextResponsible ?? parsed.currentResponsible,
            workOrder: parsed.workOrder,
          },
        });
        await executeNextAction(applied.nextAction);
        return textContent(applied);
      }
      const [workAssignment] = await db.select().from(schema.processAssignments).where(and(
        eq(schema.processAssignments.processId, parsed.processId),
        eq(schema.processAssignments.purpose, "work"),
        eq(schema.processAssignments.status, "submitted"),
      )).orderBy(desc(schema.processAssignments.submittedAt)).limit(1);
      if (!workAssignment) throw new Error("No submitted work assignment is awaiting review");

      const decision: SupervisorReviewDecision = {
        processId: parsed.processId,
        assignmentId: workAssignment.id,
        expectedRevision: parsed.expectedRevision,
        decision: parsed.decision,
        findings: parsed.feedback ? [parsed.feedback] : [],
        requestedCorrections: parsed.decision === "return" && parsed.feedback ? [parsed.feedback] : [],
        nextResponsible: parsed.nextResponsible,
        workOrder: parsed.workOrder,
      };
      const applied = await applyReviewDecision({
        userId,
        reviewer: { kind: "human", id: userId },
        decision,
        reviewAssignmentId,
      });
      await executeNextAction(applied.nextAction);
      return textContent(applied);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
