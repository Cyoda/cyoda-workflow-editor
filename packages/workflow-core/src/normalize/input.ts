import type { Workflow } from "../types/workflow.js";
import type { Processor } from "../types/processor.js";
import type { Criterion } from "../types/criterion.js";
import { MAX_CRITERION_DEPTH } from "../criteria/operators.js";

/**
 * Input normalization (spec §8.1) — runs after schema parse.
 * Mutates a deep-cloned structure; return the normalized form.
 *
 * 1. Drop empty optional containers (processors: [], criterion: {} already rejected by schema).
 * 2. Trim whitespace on name fields.
 * 3. Coerce numeric fields to integers — already enforced by Zod int().
 * 4. Coerce empty desc to undefined.
 */
export function normalizeWorkflowInput(workflow: Workflow): Workflow {
  const out: Workflow = {
    ...workflow,
    name: workflow.name.trim(),
    version: workflow.version.trim(),
    initialState: workflow.initialState.trim(),
    states: {},
  };

  if (workflow.desc !== undefined) {
    const trimmed = workflow.desc;
    if (trimmed.length === 0) {
      delete out.desc;
    } else {
      out.desc = trimmed;
    }
  }

  if (workflow.criterion !== undefined) {
    out.criterion = normalizeCriterion(workflow.criterion);
  }

  for (const [code, state] of Object.entries(workflow.states)) {
    const trimmedCode = code.trim();
    const normTransitions = state.transitions.map((t) => {
      const nt = {
        ...t,
        name: t.name.trim(),
        next: t.next.trim(),
      };
      if (t.criterion !== undefined) nt.criterion = normalizeCriterion(t.criterion);
      if (t.processors !== undefined) {
        if (t.processors.length === 0) {
          delete nt.processors;
        } else {
          nt.processors = t.processors.map(normalizeProcessor);
        }
      }
      return nt;
    });
    out.states[trimmedCode] = { transitions: normTransitions };
  }

  return out;
}

export function normalizeCriterion(criterion: Criterion, depth = 0): Criterion {
  if (depth >= MAX_CRITERION_DEPTH) {
    // Tree already exceeds the engine import limit. The semantic validator
    // will report a criterion-depth-limit error; return the node unchanged
    // here to prevent a stack overflow on pathologically nested input.
    return criterion;
  }
  switch (criterion.type) {
    case "simple":
      // Spec §4.4: IS_NULL / NOT_NULL ignore `value` at runtime, but OpenAPI
      // marks it required. Force value: null so internal state and wire form
      // agree and round-trips stay exact.
      if (criterion.operation === "IS_NULL" || criterion.operation === "NOT_NULL") {
        return { ...criterion, value: null };
      }
      return criterion;
    case "group":
      return {
        ...criterion,
        conditions: criterion.conditions.map((c) => normalizeCriterion(c, depth + 1)),
      };
    case "function": {
      const fn = criterion.function;
      const out: Criterion = {
        type: "function",
        function: {
          name: fn.name.trim(),
          ...(fn.config !== undefined ? { config: fn.config } : {}),
          ...(fn.criterion !== undefined
            ? { criterion: normalizeCriterion(fn.criterion, depth + 1) }
            : {}),
        },
      };
      return out;
    }
    case "lifecycle":
      if (criterion.operation === "IS_NULL" || criterion.operation === "NOT_NULL") {
        return { ...criterion, value: null };
      }
      return criterion;
    case "array":
      return criterion;
  }
}

export function normalizeProcessor(p: Processor): Processor {
  // `externalized` is the only processor type since the v0.8 major bump.
  return { ...p, name: p.name.trim() };
}
