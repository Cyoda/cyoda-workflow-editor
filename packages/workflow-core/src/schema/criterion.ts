import { z } from "zod";
import type { Criterion } from "../types/criterion.js";
import { NameSchema } from "./name.js";

// Operators are NOT constrained to the curated `OperatorEnum` here: cyoda-go's
// criterion DSL accepts a broader operator set than the editor's engine-verified
// catalogue, and a stored workflow using one of those must still round-trip.
// Any operator outside the known set is surfaced as a non-blocking
// `operator-not-recognized` warning by the semantic validator. See issue #22.
const OperatorParseSchema = z.string().min(1);

export const FunctionConfigSchema = z.object({
  attachEntity: z.boolean().optional(),
  calculationNodesTags: z.string().optional(),
  responseTimeoutMs: z.number().int().nonnegative().optional(),
  retryPolicy: z.string().optional(),
  context: z.string().optional(),
});

export const SimpleCriterionSchema = z.object({
  type: z.literal("simple"),
  jsonPath: z.string().min(1),
  operation: OperatorParseSchema,
  value: z.unknown().optional(),
});

export const LifecycleCriterionSchema = z.object({
  type: z.literal("lifecycle"),
  field: z.enum(["state", "creationDate", "previousTransition"]),
  operation: OperatorParseSchema,
  value: z.unknown().optional(),
});

export const ArrayCriterionSchema = z.object({
  type: z.literal("array"),
  jsonPath: z.string().min(1),
  operation: OperatorParseSchema,
  value: z.array(z.string()),
});

// Recursive shapes. Typed as `z.ZodType<Criterion>` via cast because zod's
// inferred type for `z.lazy` can't see through the self-reference and
// exactOptionalPropertyTypes makes the structural match fragile.
export const CriterionSchema: z.ZodType<Criterion> = z.lazy(() =>
  z.union([
    SimpleCriterionSchema,
    GroupCriterionSchema,
    FunctionCriterionSchema,
    LifecycleCriterionSchema,
    ArrayCriterionSchema,
  ]),
) as unknown as z.ZodType<Criterion>;

export const GroupCriterionSchema = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    operator: z.enum(["AND", "OR", "NOT"]),
    conditions: z.array(CriterionSchema).min(1),
  }),
);

export const FunctionCriterionSchema = z.lazy(() =>
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: NameSchema,
      config: FunctionConfigSchema.optional(),
      criterion: CriterionSchema.optional(),
    }),
  }),
);
