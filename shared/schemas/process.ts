import { z } from "zod";
import {
  ASSIGNMENT_STATUSES,
  CHECKPOINT_DECISIONS,
  DEADLINE_CLASSES,
  INTAKE_SOURCES,
  PROCESS_ROLES,
  PROCESS_STATUSES,
} from "../types/process";

export const processRoleSchema = z.enum(PROCESS_ROLES);
export const intakeSourceSchema = z.enum(INTAKE_SOURCES);
export const deadlineClassSchema = z.enum(DEADLINE_CLASSES);
export const processStatusSchema = z.enum(PROCESS_STATUSES);
export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export const checkpointDecisionSchema = z.enum(CHECKPOINT_DECISIONS);

export const actorRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("human"),
    id: z.string().min(1),
    displayName: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("llm"),
    role: processRoleSchema,
    id: z.string().min(1),
  }),
]);

export const objectiveSchema = z.object({
  deliverable: z.string().min(1).max(4000),
  acceptanceCriteria: z.array(z.string().min(1).max(2000)).min(1).max(30),
});

export const deadlineSchema = z.object({
  class: deadlineClassSchema,
  dueAt: z.number().int().positive().optional(),
});

export const workOrderSchema = z.object({
  objective: z.string().min(1).max(4000),
  acceptanceCriteria: z.array(z.string().min(1).max(2000)).min(1).max(30),
  requiredCapabilities: z.array(z.string().min(1).max(200)).max(50).default([]),
  stageId: z.string().min(1).max(200).optional(),
});

export const submitIntakeSchema = z.object({
  rawRequest: z.string().min(1).max(100_000),
  idempotencyKey: z.string().min(8).max(200),
  requestedSkillId: z.string().min(1).max(200).optional(),
  threadId: z.string().uuid().optional(),
  payload: z.unknown().optional(),
});

export const translateIntakeSchema = z.object({
  intakeId: z.string().uuid(),
  normalizedRequest: z.string().min(1).max(100_000),
  suggestedSkillId: z.string().min(1).max(200).optional(),
  sessionId: z.string().min(1).max(300).optional(),
});

export const supervisorOpeningSchema = z.object({
  intakeId: z.string().uuid(),
  processType: z.object({
    skillId: z.string().min(1).max(200),
    version: z.string().min(1).max(100),
  }),
  typeOwner: actorRefSchema,
  currentResponsible: actorRefSchema,
  objective: objectiveSchema,
  deadline: deadlineSchema,
  workOrder: workOrderSchema,
  rationale: z.string().min(1).max(5000),
});

export const supervisorReviewSchema = z.object({
  processId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["accept", "return", "reassign", "escalate", "complete", "cancel", "fail"]),
  findings: z.array(z.string().min(1).max(2000)).max(50).default([]),
  requestedCorrections: z.array(z.string().min(1).max(2000)).max(50).default([]),
  nextResponsible: actorRefSchema.optional(),
  workOrder: workOrderSchema.optional(),
});


export const recoveryDecisionSchema = z.object({
  processId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["return", "reassign", "cancel", "fail"]),
  feedback: z.string().min(1).max(20_000),
  nextResponsible: actorRefSchema.optional(),
  workOrder: workOrderSchema.optional(),
});

export const acceptAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  leaseMinutes: z.number().int().min(1).max(24 * 60).default(30),
});

export const artifactInputSchema = z.object({
  processId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  inlineText: z.string().max(1_000_000).optional(),
  externalUri: z.string().url().max(4000).optional(),
}).refine(value => Boolean(value.inlineText) !== Boolean(value.externalUri), {
  message: "Provide exactly one of inlineText or externalUri",
});

export const workSubmissionSchema = z.object({
  processId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  summary: z.string().min(1).max(20_000),
  result: z.unknown(),
  artifactIds: z.array(z.string().uuid()).max(100).default([]),
  limitations: z.array(z.string().min(1).max(4000)).max(50).default([]),
  recommendedNextAction: z.string().min(1).max(4000).optional(),
});

export const humanDecisionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["accept", "return", "reassign", "escalate", "complete", "cancel", "fail"]),
  feedback: z.string().max(20_000).optional(),
  nextResponsible: actorRefSchema.optional(),
  workOrder: workOrderSchema.optional(),
  typeOwner: actorRefSchema.optional(),
  currentResponsible: actorRefSchema.optional(),
  objective: objectiveSchema.optional(),
  deadline: deadlineSchema.optional(),
});

export const processIdParamsSchema = z.object({ id: z.string().uuid() });
export const checkpointIdParamsSchema = z.object({ id: z.string().uuid() });
export const assignmentIdParamsSchema = z.object({ id: z.string().uuid() });

export const processListQuerySchema = z.object({
  status: processStatusSchema.optional(),
  skillId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const runtimeFactSchema = z.object({
  eventId: z.string().min(1).max(200),
  eventType: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  turnId: z.string().max(200).optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  sequence: z.number().int().nonnegative().optional(),
  callId: z.string().max(200).optional(),
  data: z.unknown().optional(),
});

export const apiTokenCreateSchema = z.object({
  name: z.string().min(1).max(120),
});

export const metabolismActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("retry_intake"), intakeId: z.string().uuid() }),
  z.object({ kind: z.literal("retry_assignment"), assignmentId: z.string().uuid() }),
  z.object({ kind: z.literal("resume_process"), processId: z.string().uuid(), reason: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("remind_human"), processId: z.string().uuid(), assignmentId: z.string().uuid() }),
  z.object({ kind: z.literal("escalate"), processId: z.string().uuid(), reason: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("close_orphan_sandbox"), assignmentId: z.string().uuid() }),
]);

export const roleModelUpdateSchema = z.object({
  role: processRoleSchema,
  model: z.string().min(1).max(300),
  mode: z.enum(["gateway", "openai-compatible"]),
  baseURL: z.string().url().max(2000).optional().or(z.literal("")),
  contextWindowTokens: z.number().int().min(1024).max(10_000_000).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "openai-compatible" && !value.baseURL) {
    ctx.addIssue({ code: "custom", path: ["baseURL"], message: "baseURL is required for an OpenAI-compatible model" });
  }
});
