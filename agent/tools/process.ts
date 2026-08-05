import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import {
  acceptAssignmentSchema,
  artifactInputSchema,
  metabolismActionSchema,
  recoveryDecisionSchema,
  supervisorOpeningSchema,
  supervisorReviewSchema,
  workSubmissionSchema,
} from "../../shared/schemas/process.js";
import {
  acceptAssignmentRemote,
  getProcessRemote,
  heartbeatAssignmentRemote,
  listProcessesRemote,
  metabolismActionRemote,
  metabolismScanRemote,
  openProcessRemote,
  recoverProcessRemote,
  reviewProcessRemote,
  storeArtifactRemote,
  submitTranslationRemote,
  submitWorkRemote,
} from "../lib/process-internal.js";
import { institutionContext } from "../lib/role-context.js";

function resolveProcessTools(ctx: Parameters<typeof institutionContext>[0]) {
      const institution = institutionContext(ctx);
      const requireUser = () => {
        if (!institution.userId) throw new Error("This role session is missing userId");
        return institution.userId;
      };

      if (institution.role === "translator") {
        const tools = {
          get_process_status: defineTool({
            description: "Read the current process dossier for status reporting.",
            inputSchema: z.object({ processId: z.string().uuid().optional() }),
            async execute({ processId }) {
              const id = processId ?? institution.processId;
              if (!id) throw new Error("processId is required once the intake has been converted");
              return getProcessRemote(requireUser(), id);
            },
          }),
          list_my_processes: defineTool({
            description: "List the authenticated user's recent institutional processes.",
            inputSchema: z.object({}),
            async execute() {
              return { processes: await listProcessesRemote(requireUser()) };
            },
          }),
        };
        if (!institution.intakeId || institution.processId) return tools;
        return {
          ...tools,
          submit_for_supervision: defineTool({
            description: "Persist the normalized intake and launch the Supervisor. Call exactly once for every new intake.",
            inputSchema: z.object({
              normalizedRequest: z.string().min(1).max(100_000),
              suggestedSkillId: z.string().min(1).max(200).optional(),
            }),
            async execute(input) {
              if (!institution.intakeId) throw new Error("No intakeId is attached to this Translator session");
              return submitTranslationRemote({ intakeId: institution.intakeId, sessionId: ctx.session.id, ...input });
            },
          }),
        };
      }

      if (institution.role === "supervisor") {
        const tools = {
          get_process_context: defineTool({
            description: "Load the complete process dossier, checkpoints, assignments, artifacts, and Process Skill manifest.",
            inputSchema: z.object({ processId: z.string().uuid().optional() }),
            async execute({ processId }) {
              const id = processId ?? institution.processId;
              if (!id) throw new Error("processId is required");
              return getProcessRemote(requireUser(), id);
            },
          }),
        };

        if (institution.intakeId && !institution.processId) {
          return {
            ...tools,
            open_process: defineTool({
              description: "Atomically convert the attached intake into a process, opening checkpoint, and first assignment.",
              inputSchema: supervisorOpeningSchema,
              async execute(decision) {
                if (decision.intakeId !== institution.intakeId) {
                  throw new Error("Opening decision intakeId does not match this Supervisor session");
                }
                return openProcessRemote(requireUser(), decision);
              },
            }),
          };
        }

        if (institution.processId && institution.assignmentId) {
          return {
            ...tools,
            accept_checkpoint_assignment: defineTool({
              description: "Claim the attached checkpoint-review assignment before applying a review or recovery decision.",
              inputSchema: z.object({ leaseMinutes: z.number().int().min(1).max(1440).optional() }),
              async execute(input) {
                return acceptAssignmentRemote({
                  userId: requireUser(),
                  assignmentId: institution.assignmentId!,
                  sessionId: ctx.session.id,
                  leaseMinutes: input.leaseMinutes,
                  actorRole: "supervisor",
                });
              },
            }),
            recover_process: defineTool({
              description: "Apply an explicit recovery checkpoint decision after accepting the attached review assignment.",
              inputSchema: recoveryDecisionSchema,
              async execute(decision) {
                if (decision.processId !== institution.processId) {
                  throw new Error("Recovery decision processId does not match this Supervisor session");
                }
                return recoverProcessRemote(requireUser(), decision, institution.assignmentId!);
              },
            }),
            review_process: defineTool({
              description: "Apply one explicit checkpoint decision after accepting the attached review assignment and examining submitted work.",
              inputSchema: supervisorReviewSchema,
              async execute(decision) {
                if (decision.processId !== institution.processId) {
                  throw new Error("Review decision processId does not match this Supervisor session");
                }
                return reviewProcessRemote(requireUser(), decision, institution.assignmentId!);
              },
            }),
          };
        }

        return tools;
      }

      if (institution.role === "executor") {
        return {
          get_process_context: defineTool({
            description: "Load the assignment's process dossier and acceptance criteria before working.",
            inputSchema: z.object({ processId: z.string().uuid().optional() }),
            async execute({ processId }) {
              const id = processId ?? institution.processId;
              if (!id) throw new Error("processId is required");
              return getProcessRemote(requireUser(), id);
            },
          }),
          accept_assignment: defineTool({
            description: "Claim the attached assignment transactionally and start its renewable lease.",
            inputSchema: acceptAssignmentSchema.partial({ assignmentId: true }),
            async execute(input) {
              const assignmentId = input.assignmentId ?? institution.assignmentId;
              if (!assignmentId) throw new Error("assignmentId is required");
              return acceptAssignmentRemote({
                userId: requireUser(),
                assignmentId,
                sessionId: ctx.session.id,
                leaseMinutes: input.leaseMinutes,
                actorRole: "executor",
              });
            },
          }),
          heartbeat_assignment: defineTool({
            description: "Renew the assignment lease during long-running work.",
            inputSchema: z.object({ assignmentId: z.string().uuid().optional(), leaseMinutes: z.number().int().min(1).max(1440).optional() }),
            async execute(input) {
              const assignmentId = input.assignmentId ?? institution.assignmentId;
              if (!assignmentId) throw new Error("assignmentId is required");
              return heartbeatAssignmentRemote({ userId: requireUser(), assignmentId, leaseMinutes: input.leaseMinutes });
            },
          }),
          store_artifact: defineTool({
            description: "Persist a text result or external file reference in the process dossier with a SHA-256 digest.",
            inputSchema: artifactInputSchema,
            async execute(artifact) {
              if (institution.processId && artifact.processId !== institution.processId) throw new Error("Artifact processId mismatch");
              if (institution.assignmentId && artifact.assignmentId && artifact.assignmentId !== institution.assignmentId) throw new Error("Artifact assignmentId mismatch");
              return storeArtifactRemote({ userId: requireUser(), ...artifact, assignmentId: artifact.assignmentId ?? institution.assignmentId });
            },
          }),
          submit_work: defineTool({
            description: "Submit the completed work segment and launch checkpoint review. This ends the Executor's authority for the assignment.",
            inputSchema: workSubmissionSchema,
            async execute(submission) {
              if (institution.processId && submission.processId !== institution.processId) throw new Error("Submission processId mismatch");
              if (institution.assignmentId && submission.assignmentId !== institution.assignmentId) throw new Error("Submission assignmentId mismatch");
              return submitWorkRemote(requireUser(), submission);
            },
          }),
        };
      }

      return {
        metabolism_scan: defineTool({
          description: "Read deterministic liveness candidates: stale intakes, expired assignments, blocked processes, and deadlines.",
          inputSchema: z.object({}),
          async execute() {
            return metabolismScanRemote();
          },
        }),
        metabolism_apply: defineTool({
          description: "Apply one allowed liveness action after checking the candidate's current state.",
          inputSchema: metabolismActionSchema,
          async execute(action) {
            return metabolismActionRemote(action);
          },
        }),
      };
}

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => resolveProcessTools(ctx),
    "turn.started": (_event, ctx) => resolveProcessTools(ctx),
  },
});
