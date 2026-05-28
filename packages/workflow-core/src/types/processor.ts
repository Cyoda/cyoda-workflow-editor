import type { FunctionConfig } from "./criterion.js";

export type Processor = ExternalizedProcessor | ScheduledProcessor;

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

export interface ScheduledProcessor {
  type: "scheduled";
  name: string;
  config: {
    delayMs: number;
    transition: string;
    timeoutMs?: number;
  };
}

export interface ExternalizedProcessorConfig extends FunctionConfig {
  asyncResult?: boolean;
  crossoverToAsyncMs?: number;
}
