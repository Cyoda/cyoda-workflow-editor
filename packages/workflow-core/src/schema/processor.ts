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

export const ScheduledProcessorSchema = z.object({
  type: z.literal("scheduled"),
  name: NameSchema,
  config: z.object({
    delayMs: z.number().int().nonnegative(),
    transition: z.string().min(1),
    timeoutMs: z.number().int().nonnegative().optional(),
  }),
});

export const ProcessorSchema = z.discriminatedUnion("type", [
  ExternalizedProcessorSchema,
  ScheduledProcessorSchema,
]);
