import { z } from "zod";
import { AnnotationsSchema } from "./annotations.js";
import { FunctionConfigSchema } from "./criterion.js";
import { NameSchema } from "./name.js";

export const ExecutionModeSchema = z.enum([
  "SYNC",
  "ASYNC_SAME_TX",
  "ASYNC_NEW_TX",
  "COMMIT_BEFORE_DISPATCH",
]);

export const ExternalizedProcessorSchema = z.object({
  // Open string so a document with a non-canonical `type` still opens; cyoda-go
  // 0.9.0 refuses it at import, reported by the `processor-type-*` rules.
  type: z.string(),
  name: NameSchema,
  executionMode: ExecutionModeSchema.optional(),
  startNewTxOnDispatch: z.boolean().optional(),
  annotations: AnnotationsSchema.optional(),
  config: FunctionConfigSchema.and(
    z.object({
      asyncResult: z.boolean().optional(),
      // Kept `.nonnegative()` here (not relaxed per the brief's snippet) —
      // that constraint is verified server behaviour and
      // tests/processor/processor-contract.test.ts asserts -1 is an error.
      crossoverToAsyncMs: z.number().int().nonnegative().optional(),
      idempotent: z.boolean().optional(),
    }),
  ).optional(),
});

/**
 * The canonical processor schema. `type` is an open string (see above);
 * non-canonical values are surfaced by semantic validation rather than
 * rejected at parse or rewritten.
 */
export const ProcessorSchema = ExternalizedProcessorSchema;
