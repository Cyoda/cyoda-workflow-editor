import { z } from "zod";
import { FunctionConfigSchema } from "./criterion.js";
import { NameSchema } from "./name.js";

export const ExecutionModeSchema = z.enum([
  "SYNC",
  "ASYNC_SAME_TX",
  "ASYNC_NEW_TX",
  "COMMIT_BEFORE_DISPATCH",
]);

export const ExternalizedProcessorSchema = z.object({
  type: z.literal("externalized"),
  name: NameSchema,
  executionMode: ExecutionModeSchema.optional(),
  startNewTxOnDispatch: z.boolean().optional(),
  config: FunctionConfigSchema.and(
    z.object({
      asyncResult: z.boolean().optional(),
      crossoverToAsyncMs: z.number().int().nonnegative().optional(),
    }),
  ).optional(),
});

/**
 * The canonical processor schema. As of the v0.8 major bump the `scheduled`
 * processor type (an unsupported v0.7 platform hack) has been removed, leaving
 * `externalized` as the only processor type — which matches the v0.8.0 wire
 * format exactly. Kept as the dedicated processor schema rather than aliasing
 * `ExternalizedProcessorSchema` directly so future processor types can rejoin a
 * discriminated union here without churning consumers.
 */
export const ProcessorSchema = ExternalizedProcessorSchema;
