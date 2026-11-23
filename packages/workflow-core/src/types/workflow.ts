import type { Criterion } from "./criterion.js";
import type { Processor } from "./processor.js";

export type StateCode = string;
export type TransitionName = string;

/**
 * Engine-opaque, client-owned metadata attached to a workflow, state,
 * transition, processor, or criterion (via criterionAnnotations) (cyoda-go
 * 0.8.1+). Stored and round-tripped verbatim but never interpreted by the
 * engine; must be a JSON object (<= 64 KB per field).
 *
 * NB: unrelated to `@cyoda/workflow-graph`'s `GraphAnnotation`, which is a
 * validation-issue overlay on the rendered graph.
 */
export type Annotations = Record<string, unknown>;

export interface Workflow {
  version: string;
  name: string;
  desc?: string;
  initialState: StateCode;
  active: boolean;
  annotations?: Annotations;
  criterion?: Criterion;
  criterionAnnotations?: Annotations;
  states: Record<StateCode, State>;
}

export interface State {
  transitions: Transition[];
  annotations?: Annotations;
}

/**
 * A per-entity Function callout that computes a scheduled transition's firing
 * time (cyoda-go 0.8.3). Dispatched like an externalized processor, but returns
 * a typed `Schedule` result instead of an entity payload.
 */
export interface ScheduleFunction {
  name: string;
  resultKind: "Schedule";
  calculationNodesTags: string;
  attachEntity?: boolean;
  context?: string;
  responseTimeoutMs?: number;
  /** `NONE` / `FIXED` / empty (cyoda-go 0.9.0, schema 1.5). */
  retryPolicy?: string;
}

/**
 * Transition-level scheduling. Exactly one of `delayMs` / `function` must be
 * present — enforced by a Zod refine and mirrored by the `schedule-mode-required`
 * semantic rule.
 *
 * cyoda-go 0.9.0 refuses `delayMs` beside `function` whatever its value, and
 * `delayMs < 1` on its own. The v0.8.3/0.8.4 exporters wrote `delayMs: 0`
 * beside every `function`; the dialect drops any `delayMs <= 0` on parse so
 * those exports open and re-save cleanly.
 */
export interface TransitionSchedule {
  delayMs?: number;
  function?: ScheduleFunction;
  timeoutMs?: number;
}

export interface Transition {
  name: TransitionName;
  next: StateCode;
  manual: boolean;
  disabled: boolean;
  annotations?: Annotations;
  criterion?: Criterion;
  criterionAnnotations?: Annotations;
  processors?: Processor[];
  schedule?: TransitionSchedule;
}
