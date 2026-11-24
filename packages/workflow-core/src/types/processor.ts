import type { FunctionConfig } from "./criterion.js";
import type { Annotations } from "./workflow.js";

// `type` is an open string so a document carrying a non-canonical value still
// opens and can be fixed. cyoda-go 0.9.0 refuses anything but `externalized`
// (or empty) at import; that is surfaced by the `processor-type-*` rules
// rather than by a parse failure.
export type Processor = ExternalizedProcessor;

export type ExecutionMode =
  | "SYNC"
  | "ASYNC_SAME_TX"
  | "ASYNC_NEW_TX"
  | "COMMIT_BEFORE_DISPATCH";

export interface ExternalizedProcessor {
  type: string;
  name: string;
  executionMode?: ExecutionMode;
  /**
   * Processor-level, beside `executionMode` (cyoda-go 0.9.0, schema 1.5
   * tightening 16). cyoda-go 0.8.3/0.8.4 read it inside `config` instead; the
   * dialect relocates that legacy position on parse.
   */
  startNewTxOnDispatch?: boolean;
  annotations?: Annotations;
  config?: ExternalizedProcessorConfig;
}

export interface ExternalizedProcessorConfig extends FunctionConfig {
  asyncResult?: boolean;
  crossoverToAsyncMs?: number;
  /**
   * The author's declaration that the processor may be run again on another
   * compute member after the one that received the work went silent (cyoda-go
   * 0.9.0, schema 1.5). Default `false`; the server omits `false` on export.
   */
  idempotent?: boolean;
}
