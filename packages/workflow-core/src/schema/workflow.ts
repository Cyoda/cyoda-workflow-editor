import { z } from "zod";
import { AnnotationsSchema } from "./annotations.js";
import { CriterionSchema } from "./criterion.js";
import { NameSchema } from "./name.js";
import { ProcessorSchema } from "./processor.js";

export { AnnotationsSchema };

export const ScheduleFunctionSchema = z.object({
  name: z.string().min(1),
  resultKind: z.literal("Schedule"),
  calculationNodesTags: z.string().min(1),
  attachEntity: z.boolean().optional(),
  context: z.string().optional(),
  // No bound here: cyoda-go 0.9.0 refuses a negative value or one above its
  // CYODA_CALLOUT_RESPONSE_TIMEOUT_MAX_MS, reported by semantic validation so
  // the document still opens.
  responseTimeoutMs: z.number().int().optional(),
  retryPolicy: z.string().optional(),
});

export const TransitionScheduleSchema = z
  .object({
    delayMs: z.number().int().positive().optional(),
    function: ScheduleFunctionSchema.optional(),
    // Any integer: cyoda-go 0.9.0 refuses a negative value at import, but that
    // is reported by `schedule-timeout-negative` so the document still opens.
    timeoutMs: z.number().int().optional(),
  })
  .refine(
    (s) => (s.delayMs !== undefined) !== (s.function !== undefined),
    { message: "exactly one of schedule.delayMs or schedule.function is required" },
  );

export const TransitionSchema = z.object({
  name: NameSchema,
  next: NameSchema,
  manual: z.boolean(),
  disabled: z.boolean().default(false),
  annotations: AnnotationsSchema.optional(),
  criterion: CriterionSchema.optional(),
  criterionAnnotations: AnnotationsSchema.optional(),
  processors: z.array(ProcessorSchema).optional(),
  schedule: TransitionScheduleSchema.optional(),
});

export const StateSchema = z.object({
  // cyoda-go export serializes a transition-less state as `{}` (omits the
  // `transitions` key). Default to `[]` so such exports parse. See issue #21.
  transitions: z.array(TransitionSchema).default([]),
  annotations: AnnotationsSchema.optional(),
});

export const WorkflowSchema = z.object({
  version: z.string().min(1),
  name: NameSchema,
  desc: z.string().optional(),
  initialState: NameSchema,
  // The server marks `active` optional in WorkflowConfigurationDto and import
  // forces it true regardless; default to true so an export omitting it parses.
  // See issue #23.
  active: z.boolean().optional().default(true),
  annotations: AnnotationsSchema.optional(),
  criterion: CriterionSchema.optional(),
  criterionAnnotations: AnnotationsSchema.optional(),
  states: z
    .record(NameSchema, StateSchema)
    .refine((s) => Object.keys(s).length > 0, "Workflow must have at least one state"),
});
