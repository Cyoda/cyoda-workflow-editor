import type { JsonValue, OperatorType } from "./operator.js";

// Known operators get autocomplete; imported workflows may carry operators
// outside the curated set, so an arbitrary string is permitted for round-trip.
// See issue #22.
export type OperatorValue = OperatorType | (string & NonNullable<unknown>);

export type Criterion =
  | SimpleCriterion
  | GroupCriterion
  | FunctionCriterion
  | LifecycleCriterion
  | ArrayCriterion;

export interface SimpleCriterion {
  type: "simple";
  jsonPath: string;
  operation: OperatorValue;
  value?: JsonValue;
}

export interface GroupCriterion {
  type: "group";
  operator: "AND" | "OR" | "NOT";
  conditions: Criterion[];
}

export interface FunctionCriterion {
  type: "function";
  function: {
    name: string;
    config?: FunctionConfig;
    criterion?: Criterion;
  };
}

export interface LifecycleCriterion {
  type: "lifecycle";
  field: "state" | "creationDate" | "previousTransition";
  operation: OperatorValue;
  value?: JsonValue;
}

export interface ArrayCriterion {
  type: "array";
  jsonPath: string;
  operation: OperatorValue;
  value: string[];
}

export interface FunctionConfig {
  attachEntity?: boolean;
  calculationNodesTags?: string;
  responseTimeoutMs?: number;
  retryPolicy?: string;
  context?: string;
}
