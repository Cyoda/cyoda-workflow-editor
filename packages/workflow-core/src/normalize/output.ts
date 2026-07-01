import type { Criterion, FunctionConfig } from "../types/criterion.js";
import type {
  ExternalizedProcessor,
  ExternalizedProcessorConfig,
  Processor,
} from "../types/processor.js";
import type { Transition, TransitionSchedule, Workflow } from "../types/workflow.js";

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
    disabled: t.disabled,
  };
  if (options?.annotations && t.annotations !== undefined) out["annotations"] = t.annotations;
  if (t.criterion !== undefined) out["criterion"] = outputCriterion(t.criterion);
  if (t.processors !== undefined && t.processors.length > 0) {
    out["processors"] = t.processors.map(outputProcessor);
  }
  if (options?.schedule && t.schedule !== undefined) {
    out["schedule"] = outputSchedule(t.schedule);
  }
  return out;
}

function outputSchedule(s: TransitionSchedule): Record<string, unknown> {
  const out: Record<string, unknown> = { delayMs: s.delayMs };
  if (s.timeoutMs !== undefined) out["timeoutMs"] = s.timeoutMs;
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
    case "array":
      return {
        type: "array",
        jsonPath: c.jsonPath,
        operation: c.operation,
        value: c.value,
      };
  }
}

export function outputProcessor(p: Processor): Record<string, unknown> {
  // `externalized` is the only processor type since the v0.8 major bump.
  return outputExternalizedProcessor(p);
}

function outputExternalizedProcessor(p: ExternalizedProcessor): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: "externalized",
    name: p.name,
  };
  out["executionMode"] = p.executionMode ?? "ASYNC_NEW_TX";
  if ("startNewTxOnDispatch" in p && p.startNewTxOnDispatch !== undefined) {
    out["startNewTxOnDispatch"] = p.startNewTxOnDispatch;
  }
  if (p.config !== undefined) {
    const cfg = outputExternalizedConfig(p.config);
    if (Object.keys(cfg).length > 0) out["config"] = cfg;
  }
  return out;
}

function outputExternalizedConfig(cfg: ExternalizedProcessorConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // attachEntity: omit when false.
  if (cfg.attachEntity === true) out["attachEntity"] = true;
  if (cfg.calculationNodesTags !== undefined && cfg.calculationNodesTags !== "") {
    out["calculationNodesTags"] = cfg.calculationNodesTags;
  }
  if (cfg.responseTimeoutMs !== undefined) out["responseTimeoutMs"] = cfg.responseTimeoutMs;
  if (cfg.retryPolicy !== undefined && cfg.retryPolicy !== "") {
    out["retryPolicy"] = cfg.retryPolicy;
  }
  if (cfg.context !== undefined && cfg.context !== "") out["context"] = cfg.context;
  // asyncResult: omit when false.
  if (cfg.asyncResult === true) out["asyncResult"] = true;
  // crossoverToAsyncMs: pair-only with asyncResult === true.
  if (cfg.asyncResult === true && cfg.crossoverToAsyncMs !== undefined) {
    out["crossoverToAsyncMs"] = cfg.crossoverToAsyncMs;
  }
  return out;
}

export function outputFunctionConfig(
  cfg: NonNullable<Criterion extends { type: "function" } ? never : never> | FunctionConfig,
): Record<string, unknown> {
  const c = cfg as FunctionConfig;
  const out: Record<string, unknown> = {};
  if (c.attachEntity === true) out["attachEntity"] = true;
  if (c.calculationNodesTags !== undefined && c.calculationNodesTags !== "") {
    out["calculationNodesTags"] = c.calculationNodesTags;
  }
  if (c.responseTimeoutMs !== undefined) out["responseTimeoutMs"] = c.responseTimeoutMs;
  if (c.retryPolicy !== undefined && c.retryPolicy !== "") out["retryPolicy"] = c.retryPolicy;
  if (c.context !== undefined && c.context !== "") out["context"] = c.context;
  return out;
}
