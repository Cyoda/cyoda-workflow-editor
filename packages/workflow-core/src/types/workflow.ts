import type { Criterion } from "./criterion.js";
import type { Processor } from "./processor.js";

export type StateCode = string;
export type TransitionName = string;

export interface Workflow {
  version: string;
  name: string;
  desc?: string;
  initialState: StateCode;
  active: boolean;
  criterion?: Criterion;
  states: Record<StateCode, State>;
}

export interface State {
  transitions: Transition[];
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
  criterion?: Criterion;
  processors?: Processor[];
  schedule?: TransitionSchedule;
}
