import type { FunctionConfig } from "./criterion.js";

// As of the v0.8 major bump the `scheduled` processor type has been removed;
// `externalized` is the only canonical processor type.
export type Processor = ExternalizedProcessor;

export type ExecutionMode =
  | "SYNC"
  | "ASYNC_SAME_TX"
  | "ASYNC_NEW_TX"
  | "COMMIT_BEFORE_DISPATCH";

export interface ExternalizedProcessor {
  type: "externalized";
  name: string;
  executionMode?: ExecutionMode;
  startNewTxOnDispatch?: boolean;
  config?: ExternalizedProcessorConfig;
}

export interface ExternalizedProcessorConfig extends FunctionConfig {
  asyncResult?: boolean;
  crossoverToAsyncMs?: number;
}
