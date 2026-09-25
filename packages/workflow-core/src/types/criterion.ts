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

/**
 * Entity metadata fields a lifecycle criterion may address (cyoda-go 0.8.4).
 * `previousTransition` is the legacy alias of `transitionForLatestSave`; both
 * are accepted and preserved verbatim. `creationDate` and `lastUpdateTime` are
 * temporal: only comparison, range and null-presence operators apply.
 */
export type LifecycleField =
  | "state"
  | "creationDate"
  | "lastUpdateTime"
  | "previousTransition"
  | "transitionForLatestSave"
  | "transactionId"
  | "id";

export interface LifecycleCriterion {
  type: "lifecycle";
  field: LifecycleField;
  operation: OperatorValue;
  value?: JsonValue;
}

/**
 * One positional test of an array criterion: `value[i]` is compared against
 * element `i`; a `null` entry tests nothing at that index.
 */
export type ArrayCriterionValue = string | number | boolean | null;

/**
 * Positional array match. On the wire the list is `values` (cyoda-go's parser
 * reads nothing else — the OpenAPI's `value` is wrong); the canonical model
 * keeps the historical `value` name and the dialect maps between the two.
 * cyoda-go ignores `operation` on an array clause; it is optional and
 * preserved only for round-trip.
 */
export interface ArrayCriterion {
  type: "array";
  jsonPath: string;
  operation?: OperatorValue;
  value: ArrayCriterionValue[];
}

export interface FunctionConfig {
  attachEntity?: boolean;
  calculationNodesTags?: string;
  responseTimeoutMs?: number;
  retryPolicy?: string;
  context?: string;
}
