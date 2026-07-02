import { z } from "zod";
import { CriterionSchema } from "./criterion.js";
import { NameSchema } from "./name.js";
import { ProcessorSchema } from "./processor.js";

/**
 * Client-owned metadata object (cyoda-go 0.8.1). Object-only by contract:
 * arrays/primitives/null are rejected. Inner keys/values are arbitrary JSON and
 * are never inspected.
 */
export const AnnotationsSchema = z.record(z.string(), z.unknown());

/**
 * Transition-level scheduling (cyoda-go v0.8.0). A schema/SPI placeholder: a
 * scheduled transition can be configured and imported, but the workflow engine
 * does not yet execute it. The field does not exist in the v0.7 wire format.
 */
export const TransitionScheduleSchema = z.object({
  delayMs: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
});

export const TransitionSchema = z.object({
  name: NameSchema,
  next: NameSchema,
  manual: z.boolean(),
  disabled: z.boolean().default(false),
  annotations: AnnotationsSchema.optional(),
  criterion: CriterionSchema.optional(),
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
  states: z
    .record(NameSchema, StateSchema)
    .refine((s) => Object.keys(s).length > 0, "Workflow must have at least one state"),
});
