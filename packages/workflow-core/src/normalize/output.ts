import type { Criterion, FunctionConfig } from "../types/criterion.js";
import type {
  ExternalizedProcessor,
  ExternalizedProcessorConfig,
  Processor,
} from "../types/processor.js";
import type {
  ScheduleFunction,
  Transition,
  TransitionSchedule,
  Workflow,
} from "../types/workflow.js";

/**
 * Output normalization (spec §8.2) — deterministic shaping for serialization.
 * Returns plain objects in the exact keys the serializer will emit.
 */

/**
 * Per-version output options.
 * - `schedule`: emit `transitions[].schedule` (cyoda-go v0.8.0). Defaults to
 *   `false` so the v0.7 wire format (which has no such field) is unchanged.
 * - `annotations`: emit `annotations` at the workflow/state/transition levels
 *   (cyoda-go v0.8.1). Defaults to `false` so the v0.7 wire format (which has
 *   no such field) is unchanged.
 */
export interface OutputOptions {
  schedule?: boolean;
  annotations?: boolean;
}

export function outputWorkflow(
  w: Workflow,
  options?: OutputOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: w.version,
    name: w.name,
  };
  if (w.desc !== undefined) out["desc"] = w.desc;
  out["initialState"] = w.initialState;
  out["active"] = w.active;
  if (options?.annotations && w.annotations !== undefined) out["annotations"] = w.annotations;
  if (w.criterion !== undefined) out["criterion"] = outputCriterion(w.criterion);
  if (options?.annotations && w.criterionAnnotations !== undefined) {
    out["criterionAnnotations"] = w.criterionAnnotations;
  }
  out["states"] = outputStates(w.states, options);
  return out;
}

function outputStates(
  states: Workflow["states"],
  options?: OutputOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [code, state] of Object.entries(states)) {
    const stateOut: Record<string, unknown> = {
      transitions: state.transitions.map((t) => outputTransition(t, options)),
    };
    if (options?.annotations && state.annotations !== undefined) {
      stateOut["annotations"] = state.annotations;
    }
    out[code] = stateOut;
  }
  return out;
}

export function outputTransition(
  t: Transition,
  options?: OutputOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: t.name,
    next: t.next,
    manual: t.manual,
  };
  // Emit `annotations` between `manual` and `disabled` to match V0_8_WIRE_FIELDS
  // order (the 0.8 allowlist reorders regardless; this keeps emission readable
  // and consistent). Omitted for 0.7 (no annotations option), which then emits
  // the historical name/next/manual/disabled order unchanged.
  if (options?.annotations && t.annotations !== undefined) out["annotations"] = t.annotations;
  out["disabled"] = t.disabled;
  if (t.criterion !== undefined) out["criterion"] = outputCriterion(t.criterion);
  if (options?.annotations && t.criterionAnnotations !== undefined) {
    out["criterionAnnotations"] = t.criterionAnnotations;
  }
  if (t.processors !== undefined && t.processors.length > 0) {
    out["processors"] = t.processors.map((p) => outputProcessor(p, options));
  }
  if (options?.schedule && t.schedule !== undefined) {
    out["schedule"] = outputSchedule(t.schedule);
  }
  return out;
}

function outputSchedule(s: TransitionSchedule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.delayMs !== undefined) out["delayMs"] = s.delayMs;
  if (s.timeoutMs !== undefined) out["timeoutMs"] = s.timeoutMs;
  if (s.function !== undefined) out["function"] = outputScheduleFunction(s.function);
  return out;
}

function outputScheduleFunction(f: ScheduleFunction): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: f.name,
    resultKind: f.resultKind,
    calculationNodesTags: f.calculationNodesTags,
  };
  // `!== undefined`, not `=== true`: an explicit false is meaningful, since an
  // absent attachEntity means true server-side.
  if (f.attachEntity !== undefined) out["attachEntity"] = f.attachEntity;
  if (f.context !== undefined && f.context !== "") out["context"] = f.context;
  if (f.responseTimeoutMs !== undefined) out["responseTimeoutMs"] = f.responseTimeoutMs;
  return out;
}

export function outputCriterion(c: Criterion): Record<string, unknown> {
  switch (c.type) {
    case "simple": {
      const out: Record<string, unknown> = {
        type: "simple",
        jsonPath: c.jsonPath,
        operation: c.operation,
      };
      // Spec §4.4: emit explicit null for IS_NULL/NOT_NULL to satisfy the
      // OpenAPI `required` constraint on `value`.
      if (c.operation === "IS_NULL" || c.operation === "NOT_NULL") {
        out["value"] = null;
      } else if (c.value !== undefined) {
        out["value"] = c.value;
      }
      return out;
    }
    case "group":
      return {
        type: "group",
        operator: c.operator,
        conditions: c.conditions.map(outputCriterion),
      };
    case "function": {
      const fn: Record<string, unknown> = { name: c.function.name };
      if (c.function.config !== undefined) {
        const config = outputFunctionConfig(c.function.config);
        if (Object.keys(config).length > 0) fn["config"] = config;
      }
      if (c.function.criterion !== undefined) {
        fn["criterion"] = outputCriterion(c.function.criterion);
      }
      return { type: "function", function: fn };
    }
    case "lifecycle": {
      const out: Record<string, unknown> = {
        type: "lifecycle",
        field: c.field,
        operation: c.operation,
      };
      if (c.operation === "IS_NULL" || c.operation === "NOT_NULL") {
        out["value"] = null;
      } else if (c.value !== undefined) {
        out["value"] = c.value;
      }
      return out;
    }
    case "array": {
      // Wire key is `values` — the only one cyoda-go's array parser reads. An
      // array clause emitted as `value` imports cleanly but carries no
      // positional tests, so it matches every entity.
      const out: Record<string, unknown> = { type: "array", jsonPath: c.jsonPath };
      if (c.operation !== undefined) out["operation"] = c.operation;
      out["values"] = c.value;
      return out;
    }
  }
}

export function outputProcessor(
  p: Processor,
  options?: OutputOptions,
): Record<string, unknown> {
  // `type` is preserved verbatim (see types/processor.ts); the shape below
  // (name/executionMode/annotations/config) is common to every processor type.
  return outputExternalizedProcessor(p, options);
}

function outputExternalizedProcessor(
  p: ExternalizedProcessor,
  options?: OutputOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: p.type,
    name: p.name,
  };
  // Omit when absent: the server's documented default at fire is SYNC, and
  // fabricating ASYNC_NEW_TX invents a mode the user never chose.
  if (p.executionMode !== undefined) out["executionMode"] = p.executionMode;
  if (options?.annotations && p.annotations !== undefined) out["annotations"] = p.annotations;
  if (p.config !== undefined) {
    const cfg = outputExternalizedConfig(p.config);
    if (Object.keys(cfg).length > 0) out["config"] = cfg;
  }
  return out;
}

function outputExternalizedConfig(cfg: ExternalizedProcessorConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Explicit false is meaningful: absent attachEntity means true server-side,
  // so dropping false inverts the user's setting on import.
  if (cfg.attachEntity !== undefined) out["attachEntity"] = cfg.attachEntity;
  if (cfg.calculationNodesTags !== undefined && cfg.calculationNodesTags !== "") {
    out["calculationNodesTags"] = cfg.calculationNodesTags;
  }
  if (cfg.responseTimeoutMs !== undefined) out["responseTimeoutMs"] = cfg.responseTimeoutMs;
  if (cfg.retryPolicy !== undefined && cfg.retryPolicy !== "") {
    out["retryPolicy"] = cfg.retryPolicy;
  }
  if (cfg.context !== undefined && cfg.context !== "") out["context"] = cfg.context;
  if (cfg.startNewTxOnDispatch !== undefined) {
    out["startNewTxOnDispatch"] = cfg.startNewTxOnDispatch;
  }
  // The server round-trips an explicit false; only `true` is rejected, and that
  // is reported by the async-result-unsupported warning, not suppressed here.
  if (cfg.asyncResult !== undefined) out["asyncResult"] = cfg.asyncResult;
  // Emitted independently of asyncResult — silently dropping it contradicts
  // reporting it as a warning.
  if (cfg.crossoverToAsyncMs !== undefined) {
    out["crossoverToAsyncMs"] = cfg.crossoverToAsyncMs;
  }
  return out;
}

export function outputFunctionConfig(cfg: FunctionConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (cfg.attachEntity !== undefined) out["attachEntity"] = cfg.attachEntity;
  if (cfg.calculationNodesTags !== undefined && cfg.calculationNodesTags !== "") {
    out["calculationNodesTags"] = cfg.calculationNodesTags;
  }
  if (cfg.responseTimeoutMs !== undefined) out["responseTimeoutMs"] = cfg.responseTimeoutMs;
  if (cfg.retryPolicy !== undefined && cfg.retryPolicy !== "") out["retryPolicy"] = cfg.retryPolicy;
  if (cfg.context !== undefined && cfg.context !== "") out["context"] = cfg.context;
  return out;
}
