import type { Criterion } from "./criterion.js";
import type { Processor } from "./processor.js";

export type StateCode = string;
export type TransitionName = string;

/**
 * Engine-opaque, client-owned metadata attached to a workflow, state, or
 * transition (cyoda-go 0.8.1). Stored and round-tripped verbatim but never
 * interpreted by the engine; must be a JSON object (<= 64 KB per field).
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
  states: Record<StateCode, State>;
}

export interface State {
  transitions: Transition[];
  annotations?: Annotations;
}

/**
 * Transition-level scheduling (cyoda-go v0.8.0) — a schema/SPI placeholder; the
 * workflow engine does not yet execute scheduled transitions.
 */
export interface TransitionSchedule {
  delayMs: number;
  timeoutMs?: number;
}

export interface Transition {
  name: TransitionName;
  next: StateCode;
  manual: boolean;
  disabled: boolean;
  annotations?: Annotations;
  criterion?: Criterion;
  processors?: Processor[];
  schedule?: TransitionSchedule;
}
