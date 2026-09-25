import type { Criterion } from "../types/criterion.js";
import type { Workflow } from "../types/workflow.js";

/**
 * The in-document workflow schema tag is a claim about which contract the
 * workflow is written against. A workflow using a feature introduced in a
 * later MINOR must carry at least that MINOR — cyoda-go 0.8.4 does not
 * enforce this (a `NOT` criterion imports under a `1.1` tag), but such a tag
 * misrepresents the workflow: a server that only speaks the claimed version
 * cannot run it as designed.
 *
 * Source: cyoda-go `docs/workflow-schema-versioning.md` changelog. Add a row
 * here with every additive MINOR bump.
 */
const FEATURES: readonly {
  minor: number;
  feature: string;
  uses: (wf: Workflow) => boolean;
}[] = [
  {
    minor: 2,
    feature: "processor annotations",
    uses: (wf) => transitions(wf).some((t) => t.processors?.some((p) => p.annotations !== undefined)),
  },
  {
    minor: 2,
    feature: "criterionAnnotations",
    uses: (wf) =>
      wf.criterionAnnotations !== undefined ||
      transitions(wf).some((t) => t.criterionAnnotations !== undefined),
  },
  {
    minor: 3,
    feature: "schedule.function",
    uses: (wf) => transitions(wf).some((t) => t.schedule?.function !== undefined),
  },
  {
    minor: 4,
    feature: "NOT criterion group",
    uses: (wf) => criteria(wf).some(containsNot),
  },
];

/**
 * The lowest MAJOR-1 minor that covers every feature `wf` uses, with the
 * features that force it. `minor: 1` (the floor) when nothing gated is used.
 */
export function requiredSchemaMinor(wf: Workflow): { minor: number; features: string[] } {
  const used = FEATURES.filter((f) => f.uses(wf));
  const minor = used.reduce((max, f) => Math.max(max, f.minor), 1);
  return { minor, features: used.filter((f) => f.minor === minor).map((f) => f.feature) };
}

function transitions(wf: Workflow) {
  return Object.values(wf.states).flatMap((s) => s.transitions);
}

function criteria(wf: Workflow): Criterion[] {
  const out: Criterion[] = [];
  if (wf.criterion) out.push(wf.criterion);
  for (const t of transitions(wf)) if (t.criterion) out.push(t.criterion);
  return out;
}

function containsNot(root: Criterion): boolean {
  const stack: Criterion[] = [root];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (c.type === "group") {
      if (c.operator === "NOT") return true;
      for (const child of c.conditions) stack.push(child); // no spread: see cyoda-0_8.ts
    } else if (c.type === "function" && c.function.criterion) {
      stack.push(c.function.criterion);
    }
  }
  return false;
}
