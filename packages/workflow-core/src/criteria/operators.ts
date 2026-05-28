import type { OperatorType } from "../types/operator.js";

// Engine-verified canonical operator catalogue (26 entries).
// Source of truth: cyoda-go `internal/domain/search/operators.go:33-60`.
// See ai/critrion-specs.md §3.1.
export const SUPPORTED_SIMPLE_OPERATORS: ReadonlySet<OperatorType> = new Set<OperatorType>([
  "EQUALS",
  "NOT_EQUAL",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_OR_EQUAL",
  "LESS_OR_EQUAL",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "NOT_STARTS_WITH",
  "ENDS_WITH",
  "NOT_ENDS_WITH",
  "LIKE",
  "IS_NULL",
  "NOT_NULL",
  "BETWEEN",
  "BETWEEN_INCLUSIVE",
  "MATCHES_PATTERN",
  "IEQUALS",
  "INOT_EQUAL",
  "ICONTAINS",
  "INOT_CONTAINS",
  "ISTARTS_WITH",
  "INOT_STARTS_WITH",
  "IENDS_WITH",
  "INOT_ENDS_WITH",
]);

// Operators present in the OperatorType union but NOT implemented by the engine.
// Editor must surface but never offer for new criteria. See spec §3.2.
export const UNSUPPORTED_OPERATORS: ReadonlySet<OperatorType> = new Set<OperatorType>([
  "IS_UNCHANGED",
  "IS_CHANGED",
]);

// Group-condition operators the engine implements. NOT is in the schema for
// round-trip but is NOT implemented in cyoda-go (`internal/match/match.go:119-147`).
export const SUPPORTED_GROUP_OPERATORS = ["AND", "OR"] as const satisfies readonly ("AND" | "OR")[];

// Criterion-tree depth limits.
// MAX_CRITERION_DEPTH is the engine import limit (spec §2.2). Trees at or
// above this depth are rejected by cyoda-go's importer.
// CRITERION_DEPTH_WARNING_THRESHOLD is the UI/editor soft limit — beyond this
// depth, criteria are hard to read and edit.
export const MAX_CRITERION_DEPTH = 50;
export const CRITERION_DEPTH_WARNING_THRESHOLD = 5;

export type OperatorGroupId =
  | "equality"
  | "ordering"
  | "range"
  | "substring"
  | "pattern"
  | "null";

export interface OperatorGroup {
  readonly id: OperatorGroupId;
  readonly label: string;
  readonly operators: readonly OperatorType[];
}

export const OPERATOR_GROUPS: readonly OperatorGroup[] = [
  {
    id: "equality",
    label: "Equality",
    operators: ["EQUALS", "NOT_EQUAL", "IEQUALS", "INOT_EQUAL"],
  },
  {
    id: "ordering",
    label: "Ordering",
    operators: ["GREATER_THAN", "LESS_THAN", "GREATER_OR_EQUAL", "LESS_OR_EQUAL"],
  },
  {
    id: "range",
    label: "Range",
    operators: ["BETWEEN", "BETWEEN_INCLUSIVE"],
  },
  {
    id: "substring",
    label: "Substring",
    operators: [
      "CONTAINS",
      "NOT_CONTAINS",
      "ICONTAINS",
      "INOT_CONTAINS",
      "STARTS_WITH",
      "NOT_STARTS_WITH",
      "ISTARTS_WITH",
      "INOT_STARTS_WITH",
      "ENDS_WITH",
      "NOT_ENDS_WITH",
      "IENDS_WITH",
      "INOT_ENDS_WITH",
    ],
  },
  {
    id: "pattern",
    label: "Pattern",
    operators: ["LIKE", "MATCHES_PATTERN"],
  },
  {
    id: "null",
    label: "Null",
    operators: ["IS_NULL", "NOT_NULL"],
  },
];

export type OperatorValueShape = "scalar" | "range" | "none";

// Per-operator value shape used by UI widgets and value validation.
// "range" = two-element [low, high] array; "none" = value ignored at runtime
// but emitted as null on the wire (spec §4.4). Unsupported operators are
// not listed here — callers must check SUPPORTED_SIMPLE_OPERATORS first.
export const OPERATOR_VALUE_SHAPE: Readonly<Record<OperatorType, OperatorValueShape>> = {
  EQUALS: "scalar",
  NOT_EQUAL: "scalar",
  GREATER_THAN: "scalar",
  LESS_THAN: "scalar",
  GREATER_OR_EQUAL: "scalar",
  LESS_OR_EQUAL: "scalar",
  CONTAINS: "scalar",
  NOT_CONTAINS: "scalar",
  STARTS_WITH: "scalar",
  NOT_STARTS_WITH: "scalar",
  ENDS_WITH: "scalar",
  NOT_ENDS_WITH: "scalar",
  LIKE: "scalar",
  MATCHES_PATTERN: "scalar",
  IEQUALS: "scalar",
  INOT_EQUAL: "scalar",
  ICONTAINS: "scalar",
  INOT_CONTAINS: "scalar",
  ISTARTS_WITH: "scalar",
  INOT_STARTS_WITH: "scalar",
  IENDS_WITH: "scalar",
  INOT_ENDS_WITH: "scalar",
  BETWEEN: "range",
  BETWEEN_INCLUSIVE: "range",
  IS_NULL: "none",
  NOT_NULL: "none",
  IS_UNCHANGED: "none",
  IS_CHANGED: "none",
};
