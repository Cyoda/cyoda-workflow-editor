import type { Criterion, Processor, Transition } from "@cyoda/workflow-core";
import type { CriterionSummary, ProcessorSummary, TransitionSummary } from "../types.js";
import { opShort, truncate } from "./op-short.js";

export function summarizeTransition(t: Transition): TransitionSummary {
  const summary: TransitionSummary = {
    display: truncate(t.name),
    full: t.name,
  };
  if (t.criterion) summary.criterion = summarizeCriterion(t.criterion);
  const proc = summarizeProcessors(t.processors);
  if (proc) summary.processor = proc;
  if (hasCommitBeforeDispatch(t.processors)) summary.commitBeforeDispatch = true;
  return summary;
}

export function summarizeCriterion(c: Criterion): CriterionSummary {
  switch (c.type) {
    case "simple":
      return { kind: "simple", op: opShort(c.operation), path: truncate(c.jsonPath) };
    case "function":
      return { kind: "function", name: truncate(c.function.name) };
    case "lifecycle":
      return { kind: "lifecycle", field: c.field, op: opShort(c.operation) };
    case "array":
      // cyoda-go ignores an array clause's operator — each positional entry is
      // an equality test — so an absent one summarises as EQUALS.
      return { kind: "array", op: opShort(c.operation ?? "EQUALS"), path: truncate(c.jsonPath) };
    case "group":
      return { kind: "group", operator: c.operator, count: c.conditions.length };
  }
}

export function summarizeProcessors(
  processors: Processor[] | undefined,
): ProcessorSummary | undefined {
  if (!processors || processors.length === 0) return undefined;
  if (processors.length === 1) {
    const first = processors[0]!;
    return { kind: "single", name: truncate(first.name) };
  }
  return { kind: "multiple", count: processors.length };
}

/**
 * True when any processor on the transition runs in COMMIT_BEFORE_DISPATCH
 * mode — the operationally significant mode where Cyoda commits the entity
 * before calling the processor (the intermediate state becomes publicly
 * observable, and the processor must be idempotent since it can be
 * replayed). Checks every processor, not just the first: a transition with
 * a commit-before-dispatch step anywhere has that property. `executionMode`
 * is meaningful regardless of `type` — cyoda-go preserves `type` verbatim,
 * and skipping non-"externalized" processors here would silently drop them.
 */
function hasCommitBeforeDispatch(processors: Processor[] | undefined): boolean {
  if (!processors) return false;
  return processors.some((p) => p.executionMode === "COMMIT_BEFORE_DISPATCH");
}
