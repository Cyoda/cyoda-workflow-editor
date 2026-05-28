import { z } from "zod";
import { CriterionSchema } from "./criterion.js";
import { NameSchema } from "./name.js";
import { ProcessorSchema } from "./processor.js";

export const TransitionSchema = z.object({
  name: NameSchema,
  next: NameSchema,
  manual: z.boolean(),
  disabled: z.boolean().default(false),
  criterion: CriterionSchema.optional(),
  processors: z.array(ProcessorSchema).optional(),
});

export const StateSchema = z.object({
  transitions: z.array(TransitionSchema),
});

export const WorkflowSchema = z.object({
  version: z.string().min(1),
  name: NameSchema,
  desc: z.string().optional(),
  initialState: NameSchema,
  active: z.boolean(),
  criterion: CriterionSchema.optional(),
  states: z
    .record(NameSchema, StateSchema)
    .refine((s) => Object.keys(s).length > 0, "Workflow must have at least one state"),
});
