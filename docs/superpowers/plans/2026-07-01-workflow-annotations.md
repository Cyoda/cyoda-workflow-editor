# Workflow `annotations` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve cyoda-go 0.8.1's optional, engine-opaque `annotations` metadata (workflow / state / transition level) through the editor's open → edit → save round-trip, and let users edit it via the existing Monaco JSON editor.

**Architecture:** All changes are in `@cyoda/workflow-core`. Annotations flow through the existing dialect seam: parse (`operator-alias` → Zod → `normalize/input`) must stop dropping/mangling them; serialize (`normalize/output` → `dialect/cyoda-0_8` allowlist) must emit them for the `"0.8"` dialect only; a semantic validator blocks an over-cap save with a locatable error. The Monaco editor picks up autocomplete/validation for free because its schema is generated from `ImportPayloadSchema`.

**Tech Stack:** TypeScript (ES2022, ESM), Zod 4, Vitest, tsup, Changesets, pnpm workspace.

## Global Constraints

- Changes are confined to `packages/workflow-core/` (model/parse/serialize/validate), plus a Monaco *verification test* in `packages/workflow-monaco/` and one root `.changeset/` file. No changes to `cyoda-dev-console`, and no runtime-source changes to any package other than `workflow-core`.
- `workflow-core`'s own tests import from `../../src/**` (run against source — no build needed). `workflow-monaco` imports `@cyoda/workflow-core` from its built `dist`, so **rebuild `workflow-core` before running any `workflow-monaco` test** (`pnpm --filter @cyoda/workflow-core build`).
- `annotations` is **object-only** (JSON object; reject arrays/primitives/null), **engine-opaque** (emit inner keys verbatim — never allowlist or normalize inside it), capped at **64 KB per field** (`ANNOTATIONS_MAX_BYTES = 64 * 1024`, compacted UTF-8 bytes).
- The `"0.8"` dialect targets cyoda-go **0.8.1**; the `"0.7"` dialect must **never** emit `annotations`.
- `@cyoda/workflow-core` release is a **minor** bump (0.3.0 → 0.4.0). Use a `minor` changeset, never `major`.
- Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run commands from the repo root: `/Users/paul/dev/cyoda-workflow-editor`.
- Single-file test run: `pnpm --filter @cyoda/workflow-core exec vitest run <path>`.
- Full checks: `pnpm --filter @cyoda/workflow-core test`, `... typecheck`, and `pnpm lint`.

---

### Task 1: Make `normalizeOperatorAlias` annotations-blind (spec §0)

The alias pass runs in every dialect's `toCanonical` *before* Zod and recurses into every object. It would rewrite `operatorType`→`operation` inside a client annotation, and throw when an annotation carries both keys with differing values. Fix it first, before Task 2 makes annotations reachable.

**Files:**
- Modify: `packages/workflow-core/src/parse/operator-alias.ts:21-24`
- Test: `packages/workflow-core/tests/parse/annotations.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeOperatorAlias(raw: unknown): unknown` — unchanged signature; now copies any `annotations`-keyed value verbatim (cloned) instead of recursing into it. Already exported from `src/index.js`.

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-core/tests/parse/annotations.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { normalizeOperatorAlias } from "../../src/index.js";

describe("normalizeOperatorAlias leaves annotations untouched", () => {
  test("does not rename operatorType inside an annotations object", () => {
    const input = {
      workflows: [
        { name: "wf", annotations: { filter: { operatorType: "custom" } }, states: {} },
      ],
    };
    const out = normalizeOperatorAlias(input) as typeof input;
    expect(out.workflows[0]!.annotations).toEqual({ filter: { operatorType: "custom" } });
  });

  test("does not throw when an annotation carries both operation and operatorType", () => {
    const input = { annotations: { operation: "A", operatorType: "B" } };
    expect(() => normalizeOperatorAlias(input)).not.toThrow();
    expect((normalizeOperatorAlias(input) as typeof input).annotations).toEqual({
      operation: "A",
      operatorType: "B",
    });
  });

  test("still aliases operatorType -> operation on a real criterion", () => {
    const out = normalizeOperatorAlias({
      type: "simple",
      jsonPath: "$.x",
      operatorType: "EQUALS",
      value: "1",
    }) as Record<string, unknown>;
    expect(out.operation).toBe("EQUALS");
    expect("operatorType" in out).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts`
Expected: FAIL — the first test shows `annotations` rewritten to `{ filter: { operation: "custom" } }`; the second throws `Conflicting "operation" and "operatorType"`.

- [ ] **Step 3: Write minimal implementation**

In `packages/workflow-core/src/parse/operator-alias.ts`, replace the loop (currently lines 21-24):

```ts
  const result: UnknownRecord = {};
  for (const [k, v] of Object.entries(raw)) {
    result[k] = normalizeOperatorAlias(v);
  }
```

with:

```ts
  const result: UnknownRecord = {};
  for (const [k, v] of Object.entries(raw)) {
    // `annotations` is engine-opaque, client-owned metadata (workflow/state/
    // transition level, cyoda-go 0.8.1). Never recurse into it: aliasing
    // operatorType->operation inside a client's opaque object would corrupt it,
    // and a value carrying both keys would throw. Clone so the "returns a new
    // tree" invariant in this function's docstring still holds.
    result[k] = k === "annotations" ? structuredClone(v) : normalizeOperatorAlias(v);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-core/src/parse/operator-alias.ts packages/workflow-core/tests/parse/annotations.test.ts
git commit -m "fix(core): make normalizeOperatorAlias skip annotations subtrees

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Canonical `Annotations` type + Zod schema + exports (spec §1, §2, §7)

Add the model + schema so annotations survive Zod validation (import-side stripping stops for workflow and transition; state is fixed in Task 3). Exporting `AnnotationsSchema`/`Annotations` lets downstream reference it, and drives Monaco autocomplete via the existing `ImportPayloadSchema`→`z.toJSONSchema` path.

**Files:**
- Modify: `packages/workflow-core/src/types/workflow.ts`
- Modify: `packages/workflow-core/src/schema/workflow.ts`
- Modify: `packages/workflow-core/src/types/index.ts:19-26`
- Modify: `packages/workflow-core/src/schema/index.ts:18-23`
- Modify: `packages/workflow-core/src/index.ts` (type block ~L4-52, schema block ~L61-81)
- Test: `packages/workflow-core/tests/parse/annotations.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's alias fix (so annotations reach Zod uncorrupted).
- Produces:
  - `type Annotations = Record<string, unknown>` (from `types/workflow.js`, re-exported at package root).
  - `AnnotationsSchema` (Zod, `= z.record(z.string(), z.unknown())`, from `schema/workflow.js`, re-exported at package root).
  - `Workflow.annotations?: Annotations`, `State.annotations?: Annotations`, `Transition.annotations?: Annotations`.

- [ ] **Step 1: Write the failing test**

Append to `packages/workflow-core/tests/parse/annotations.test.ts`:

```ts
import { AnnotationsSchema, parseImportPayload } from "../../src/index.js";

describe("AnnotationsSchema is object-only", () => {
  test("accepts objects (including empty and nested)", () => {
    expect(AnnotationsSchema.safeParse({}).success).toBe(true);
    expect(AnnotationsSchema.safeParse({ a: { b: [1, 2] } }).success).toBe(true);
  });
  test("rejects non-objects", () => {
    for (const bad of [null, [], "s", 3, true]) {
      expect(AnnotationsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("workflow- and transition-level annotations survive parse", () => {
  test("workflow.annotations and transition.annotations are preserved", () => {
    const json = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "NEW",
          active: true,
          annotations: { label: "L" },
          states: {
            NEW: {
              transitions: [
                { name: "go", next: "DONE", manual: false, annotations: { ui: 1 } },
              ],
            },
            DONE: { transitions: [] },
          },
        },
      ],
    });
    const result = parseImportPayload(json);
    const wf = result.document!.session.workflows[0]!;
    expect(wf.annotations).toEqual({ label: "L" });
    expect(wf.states["NEW"]!.transitions[0]!.annotations).toEqual({ ui: 1 });
  });
});
```

(Merge the new `import` line with the existing one from Task 1, or add it — both resolve to `../../src/index.js`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts`
Expected: FAIL — `AnnotationsSchema` is not exported (import error), and the parse test would drop annotations.

- [ ] **Step 3: Write minimal implementation**

**3a.** In `packages/workflow-core/src/types/workflow.ts`, add above `export interface Workflow`:

```ts
/**
 * Engine-opaque, client-owned metadata attached to a workflow, state, or
 * transition (cyoda-go 0.8.1). Stored and round-tripped verbatim but never
 * interpreted by the engine; must be a JSON object (<= 64 KB per field).
 *
 * NB: unrelated to `@cyoda/workflow-graph`'s `GraphAnnotation`, which is a
 * validation-issue overlay on the rendered graph.
 */
export type Annotations = Record<string, unknown>;
```

Add `annotations?: Annotations;` to each interface:

```ts
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
```

**3b.** In `packages/workflow-core/src/schema/workflow.ts`, add after the imports:

```ts
/**
 * Client-owned metadata object (cyoda-go 0.8.1). Object-only by contract:
 * arrays/primitives/null are rejected. Inner keys/values are arbitrary JSON and
 * are never inspected.
 */
export const AnnotationsSchema = z.record(z.string(), z.unknown());
```

Add `annotations: AnnotationsSchema.optional(),` to the three schemas:

```ts
export const TransitionSchema = z.object({
  name: NameSchema,
  next: NameSchema,
  manual: z.boolean(),
  disabled: z.boolean().default(false),
  annotations: AnnotationsSchema.optional(),
  criterion: CriterionSchema.optional(),
  processors: z.array(ProcessorSchema).optional(),
  schedule: TransitionScheduleSchema.optional(),
});

export const StateSchema = z.object({
  transitions: z.array(TransitionSchema).default([]),
  annotations: AnnotationsSchema.optional(),
});

export const WorkflowSchema = z.object({
  version: z.string().min(1),
  name: NameSchema,
  desc: z.string().optional(),
  initialState: NameSchema,
  active: z.boolean().optional().default(true),
  annotations: AnnotationsSchema.optional(),
  criterion: CriterionSchema.optional(),
  states: z
    .record(NameSchema, StateSchema)
    .refine((s) => Object.keys(s).length > 0, "Workflow must have at least one state"),
});
```

**3c.** In `packages/workflow-core/src/types/index.ts`, add `Annotations,` to the `./workflow.js` type export (lines 19-26):

```ts
export type {
  StateCode,
  TransitionName,
  Workflow,
  State,
  Transition,
  TransitionSchedule,
  Annotations,
} from "./workflow.js";
```

**3d.** In `packages/workflow-core/src/schema/index.ts`, add `AnnotationsSchema,` to the `./workflow.js` export:

```ts
export {
  AnnotationsSchema,
  StateSchema,
  TransitionSchema,
  TransitionScheduleSchema,
  WorkflowSchema,
} from "./workflow.js";
```

**3e.** In `packages/workflow-core/src/index.ts`, add `Annotations,` to the top of the `export type { ... } from "./types/index.js";` block (it is alphabetically first, before `ArrayCriterion`), and add `AnnotationsSchema,` to the top of the `export { ... } from "./schema/index.js";` block (before `ArrayCriterionSchema`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts`
Expected: PASS (all tests, including the two new blocks).

- [ ] **Step 5: Typecheck (no regression from the model change)**

Run: `pnpm --filter @cyoda/workflow-core typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add packages/workflow-core/src/types/workflow.ts packages/workflow-core/src/schema/workflow.ts packages/workflow-core/src/types/index.ts packages/workflow-core/src/schema/index.ts packages/workflow-core/src/index.ts packages/workflow-core/tests/parse/annotations.test.ts
git commit -m "feat(core): model annotations (object-only) at workflow/state/transition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Preserve state-level annotations in input normalization (spec §3)

`normalizeWorkflowInput` rebuilds each state as `{ transitions }`, dropping `state.annotations`. Workflow- and transition-level already survive (spread). Fix the state rebuild.

**Files:**
- Modify: `packages/workflow-core/src/normalize/input.ts:37-56`
- Test: `packages/workflow-core/tests/parse/annotations.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `State.annotations`.
- Produces: `normalizeWorkflowInput(workflow: Workflow): Workflow` — unchanged signature; now carries `state.annotations` through.

- [ ] **Step 1: Write the failing test**

Append to `packages/workflow-core/tests/parse/annotations.test.ts`:

```ts
describe("state-level annotations survive parse", () => {
  test("normalizeWorkflowInput keeps state.annotations", () => {
    const json = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "NEW",
          active: true,
          states: { NEW: { transitions: [], annotations: { hint: "start" } } },
        },
      ],
    });
    const result = parseImportPayload(json);
    const state = result.document!.session.workflows[0]!.states["NEW"]!;
    expect(state.annotations).toEqual({ hint: "start" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts -t "keeps state.annotations"`
Expected: FAIL — `state.annotations` is `undefined` (rebuilt as `{ transitions }`).

- [ ] **Step 3: Write minimal implementation**

In `packages/workflow-core/src/normalize/input.ts`, the state-building line (currently `out.states[trimmedCode] = { transitions: normTransitions };`, ~line 55) becomes:

```ts
    const normState: State = { transitions: normTransitions };
    if (state.annotations !== undefined) normState.annotations = state.annotations;
    out.states[trimmedCode] = normState;
```

Add `State` to the type import at the top of the file:

```ts
import type { State, Workflow } from "../types/workflow.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/parse/annotations.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-core/src/normalize/input.ts packages/workflow-core/tests/parse/annotations.test.ts
git commit -m "fix(core): preserve state-level annotations in input normalization

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Emit annotations on serialize + 0.8 allowlist (spec §4, §5)

Add an `OutputOptions.annotations` flag (mirrors `schedule`), emit annotations at all three levels, and add `annotations` to the `"0.8"` wire allowlist so it survives `pick`. The `"0.7"` dialect passes no flag, so it keeps omitting annotations.

**Files:**
- Modify: `packages/workflow-core/src/normalize/output.ts` (OutputOptions ~L19-21, `outputWorkflow` ~L23-37, `outputStates` ~L39-48, `outputTransition` ~L50-68)
- Modify: `packages/workflow-core/src/dialect/cyoda-0_8.ts` (emit call ~L44, `WORKFLOW_FIELDS`/`STATE_FIELDS`/`TRANSITION_FIELDS` ~L50-68, header comment ~L13-24)
- Test: `packages/workflow-core/tests/dialect/version-0_8.test.ts` (append)
- Create: `packages/workflow-core/tests/golden/fixtures/annotations.json`

**Interfaces:**
- Consumes: Task 2 (`Workflow/State/Transition.annotations`), Task 3 (state annotations in the canonical model), `V0_8_WIRE_FIELDS` from `dialect/cyoda-0_8.js`.
- Produces: `OutputOptions.annotations?: boolean`; the `"0.8"` dialect emits annotations; `V0_8_WIRE_FIELDS.workflow/state/transition` include `"annotations"`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/workflow-core/tests/dialect/version-0_8.test.ts`:

```ts
const annotatedWorkflow = {
  version: "1.0",
  name: "wf",
  initialState: "new",
  active: true,
  annotations: { label: "L", roles: ["r"] },
  states: {
    new: {
      transitions: [
        { name: "go", next: "done", manual: false, annotations: { ui: { color: "green" } } },
      ],
      annotations: { hint: "start" },
    },
    done: { transitions: [] },
  },
};

describe("0.8 dialect round-trips annotations", () => {
  test("annotations at all three levels survive parse -> serialize -> parse", () => {
    const first = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire1 = serializeImportPayload(first.document!, { targetVersion: "0.8" });
    const second = parseImportPayload(wire1, undefined, { sourceVersion: "0.8" });
    const wire2 = serializeImportPayload(second.document!, { targetVersion: "0.8" });

    expect(wire2).toBe(wire1);
    const wf = JSON.parse(wire1).workflows[0];
    expect(wf.annotations).toEqual({ label: "L", roles: ["r"] });
    expect(wf.states.new.annotations).toEqual({ hint: "start" });
    expect(wf.states.new.transitions[0].annotations).toEqual({ ui: { color: "green" } });
  });

  test("opaque inner keys of annotations are NOT stripped by the allowlist", () => {
    const parsed = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire = serializeImportPayload(parsed.document!, { targetVersion: "0.8" });
    expect(wire).toContain('"color"');
  });

  test("0.7 wire omits annotations (field absent in v0.7)", () => {
    const parsed = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire07 = serializeImportPayload(parsed.document!, { targetVersion: "0.7" });
    expect(wire07).not.toContain('"annotations"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/dialect/version-0_8.test.ts`
Expected: FAIL — annotations absent from the 0.8 wire (`wf.annotations` is `undefined`).

- [ ] **Step 3: Write minimal implementation**

**3a.** In `packages/workflow-core/src/normalize/output.ts`, extend `OutputOptions`:

```ts
export interface OutputOptions {
  schedule?: boolean;
  annotations?: boolean;
}
```

In `outputWorkflow`, after `out["active"] = w.active;` and before the `criterion` line:

```ts
  out["active"] = w.active;
  if (options?.annotations && w.annotations !== undefined) out["annotations"] = w.annotations;
  if (w.criterion !== undefined) out["criterion"] = outputCriterion(w.criterion);
```

Rewrite `outputStates` so a state emits its annotations:

```ts
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
```

In `outputTransition`, after the initial `out` literal (which sets `name/next/manual/disabled`):

```ts
  if (options?.annotations && t.annotations !== undefined) out["annotations"] = t.annotations;
```

**3b.** In `packages/workflow-core/src/dialect/cyoda-0_8.ts`, change the emit call (~L44):

```ts
    return workflows.map((wf) => allowlistWorkflow(outputWorkflow(wf, { schedule: true, annotations: true })));
```

Add `"annotations"` to the three field lists, in the positions matching the 0.8.1 help:

```ts
const WORKFLOW_FIELDS = [
  "version",
  "name",
  "desc",
  "initialState",
  "active",
  "annotations",
  "criterion",
  "states",
] as const;
const STATE_FIELDS = ["transitions", "annotations"] as const;
const TRANSITION_FIELDS = [
  "name",
  "next",
  "manual",
  "annotations",
  "disabled",
  "criterion",
  "processors",
  "schedule",
] as const;
```

**3c.** In the same file's header doc comment, add a delta bullet noting the retrofit target:

```ts
 * - **`annotations` added (cyoda-go 0.8.1).** Engine-opaque, client-owned JSON
 *   object at workflow/state/transition level, emitted verbatim (its inner keys
 *   are intentionally not allowlisted). The `"0.8"` dialect targets 0.8.1;
 *   0.8.0 never shipped. The 0.7 dialect omits it.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/dialect/version-0_8.test.ts`
Expected: PASS (existing schedule/allowlist tests + the three new annotation tests).

- [ ] **Step 5: Add the golden round-trip fixture**

Create `packages/workflow-core/tests/golden/fixtures/annotations.json` (keys are already in the `"0.8"` emit order so the byte-identity runner passes):

```json
{
  "importMode": "MERGE",
  "workflows": [
    {
      "version": "1.0",
      "name": "annotated",
      "initialState": "NEW",
      "active": true,
      "annotations": {
        "label": "Prize lifecycle",
        "roles": ["reviewer"]
      },
      "states": {
        "NEW": {
          "transitions": [
            {
              "name": "APPROVE",
              "next": "APPROVED",
              "manual": false,
              "annotations": {
                "ui": {
                  "color": "green"
                }
              },
              "disabled": false
            }
          ],
          "annotations": {
            "hint": "start here"
          }
        },
        "APPROVED": {
          "transitions": []
        }
      }
    }
  ]
}
```

- [ ] **Step 6: Run the golden suite**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/golden/runner.test.ts`
Expected: PASS — `annotations.json parses, validates clean, serializes byte-identical` (and all existing fixtures still pass).

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-core/src/normalize/output.ts packages/workflow-core/src/dialect/cyoda-0_8.ts packages/workflow-core/tests/dialect/version-0_8.test.ts packages/workflow-core/tests/golden/fixtures/annotations.json
git commit -m "feat(core): emit annotations in the 0.8 dialect wire output

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 64 KB cap as a locatable semantic error (spec §6)

Block a save whose annotations exceed 64 KB, before cyoda-go returns a 400. Unlike `name-too-long`, annotations are invisible on the graph, so the issue must carry a `targetId` so Monaco anchors it (not line 1) and the issues drawer can jump to it.

**Files:**
- Modify: `packages/workflow-core/src/validate/semantic.ts` (add constant + `stateTargetId` + `annotationsSizeIssues`; call it in `validateSemantics` after `automatedOrderingRules`, ~L68)
- Test: `packages/workflow-core/tests/semantic/annotations-size.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 2-3 (annotations present in the canonical model), `idFor`/`transitionTargetId` (existing in `semantic.ts`), `idFor as identityIdFor` from `identity/id-for.js` (already imported).
- Produces: `ANNOTATIONS_MAX_BYTES = 64 * 1024` (exported); a blocking issue `{ code: "annotations-too-large", severity: "error", targetId, detail: { bytes, max } }` emitted once per over-cap workflow/state/transition annotation.

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-core/tests/semantic/annotations-size.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseImportPayload } from "../../src/index.js";

function payloadWithStateAnnotation(annotation: Record<string, unknown>): string {
  return JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "NEW",
        active: true,
        states: { NEW: { transitions: [], annotations: annotation } },
      },
    ],
  });
}

describe("annotations-too-large", () => {
  test("a >64KB state annotation is a blocking error carrying the state targetId", () => {
    const result = parseImportPayload(payloadWithStateAnnotation({ blob: "x".repeat(70_000) }));
    const issue = result.issues.find((i) => i.code === "annotations-too-large");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");

    const doc = result.document!;
    const stateId = Object.entries(doc.meta.ids.states).find(([, p]) => p.state === "NEW")?.[0];
    expect(issue!.targetId).toBe(stateId);
    expect(result.ok).toBe(false);
  });

  test("a small annotation produces no size error", () => {
    const result = parseImportPayload(payloadWithStateAnnotation({ ok: true }));
    expect(result.issues.some((i) => i.code === "annotations-too-large")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/semantic/annotations-size.test.ts`
Expected: FAIL — no `annotations-too-large` issue exists yet.

- [ ] **Step 3: Write minimal implementation**

In `packages/workflow-core/src/validate/semantic.ts`, add near the other exported constants:

```ts
export const ANNOTATIONS_MAX_BYTES = 64 * 1024;
```

Add these helpers (near `transitionTargetId`):

```ts
function stateTargetId(
  doc: WorkflowEditorDocument | undefined,
  workflow: string,
  state: string,
): { targetId?: string } {
  if (!doc) return {};
  const id = identityIdFor(doc.meta, { kind: "state", workflow, state });
  return id ? { targetId: id } : {};
}

function annotationBytes(annotations: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(annotations)).length;
}

function annotationsSizeIssues(
  session: WorkflowSession,
  doc?: WorkflowEditorDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const max = ANNOTATIONS_MAX_BYTES;
  for (const wf of session.workflows) {
    if (wf.annotations !== undefined) {
      const bytes = annotationBytes(wf.annotations);
      if (bytes > max) {
        issues.push({
          severity: "error",
          code: "annotations-too-large",
          message: `Annotations on workflow "${wf.name}" are ${bytes} bytes, over the ${max}-byte limit.`,
          ...idFor(doc, wf.name, "workflow"),
          detail: { bytes, max },
        });
      }
    }
    for (const [stateCode, state] of Object.entries(wf.states)) {
      if (state.annotations !== undefined) {
        const bytes = annotationBytes(state.annotations);
        if (bytes > max) {
          issues.push({
            severity: "error",
            code: "annotations-too-large",
            message: `Annotations on state "${stateCode}" (workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
            ...stateTargetId(doc, wf.name, stateCode),
            detail: { bytes, max },
          });
        }
      }
      state.transitions.forEach((t, index) => {
        if (t.annotations === undefined) return;
        const bytes = annotationBytes(t.annotations);
        if (bytes > max) {
          issues.push({
            severity: "error",
            code: "annotations-too-large",
            message: `Annotations on transition "${t.name}" (state "${stateCode}", workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
            detail: { bytes, max },
          });
        }
      });
    }
  }
  return issues;
}
```

Wire it into `validateSemantics`, immediately after the `automatedOrderingRules` line:

```ts
  issues.push(...automatedOrderingRules(session, doc));
  issues.push(...annotationsSizeIssues(session, doc));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/semantic/annotations-size.test.ts`
Expected: PASS (2 tests). The state-level `targetId` is the first of its kind; Monaco/React resolution of state ids is already covered by `workflow-monaco`'s existing `markers.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-core/src/validate/semantic.ts packages/workflow-core/tests/semantic/annotations-size.test.ts
git commit -m "feat(core): block over-cap annotations with a locatable semantic error

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Monaco JSON-editor schema verification (requirement #2)

The Monaco editor derives its schema from `ImportPayloadSchema` via `z.toJSONSchema`, so Task 2 already makes `annotations` autocomplete/validate in the editor with **no `workflow-monaco` code change**. Add a test that proves it, so "edit via the existing JSON editor" is guarded. Monaco imports the **built** `@cyoda/workflow-core`, so rebuild core first.

**Files:**
- Test: `packages/workflow-monaco/tests/schema.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `annotations` on `WorkflowSchema`/`StateSchema`/`TransitionSchema`, reached transitively through `ImportPayloadSchema` (from built `dist`).
- Produces: nothing (verification only).

- [ ] **Step 1: Rebuild workflow-core so Monaco resolves the new schema**

Run: `pnpm --filter @cyoda/workflow-core build`
Expected: build succeeds; `dist/` now contains `annotations` in the schema.

- [ ] **Step 2: Write the test**

Append inside the existing `describe("workflowJsonSchema", ...)` block in `packages/workflow-monaco/tests/schema.test.ts`:

```ts
  it("includes annotations as an optional object at workflow/state/transition levels", () => {
    const schema = workflowJsonSchema();
    const annNodes: Record<string, unknown>[] = [];
    let requiredViolations = 0;
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      const props = obj["properties"] as Record<string, unknown> | undefined;
      if (props && props["annotations"]) {
        annNodes.push(props["annotations"] as Record<string, unknown>);
        const required = (obj["required"] as string[] | undefined) ?? [];
        if (required.includes("annotations")) requiredViolations += 1;
      }
      for (const value of Object.values(obj)) walk(value);
    };
    walk(schema);

    // WorkflowSchema, StateSchema, TransitionSchema each contribute one inlined node.
    expect(annNodes.length).toBeGreaterThanOrEqual(3);
    for (const n of annNodes) expect(n["type"]).toBe("object");
    expect(requiredViolations).toBe(0);
  });
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @cyoda/workflow-monaco exec vitest run tests/schema.test.ts`
Expected: PASS. If it finds fewer than 3, `annotations` is missing from a schema — re-check Task 2's `AnnotationsSchema.optional()` on all three schemas (and that Step 1's build actually ran).

- [ ] **Step 4: Commit**

```bash
git add packages/workflow-monaco/tests/schema.test.ts
git commit -m "test(monaco): assert annotations surface in the generated JSON schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs, comment audit, changeset, and full verification

Document the wire change, scope-correct the `0.8.0` comments, add the release changeset, and run the whole package green.

**Files:**
- Modify: `ai/cyoda-schema-versions.md` (append a `v0.8.1` section)
- Modify: `packages/workflow-core/src/dialect/cyoda-0_8.ts` (header comment only — the two "current default / Covers" lines)
- Create: `.changeset/workflow-annotations.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release-ready package at 0.4.0 with docs.

- [ ] **Step 1: Append the version section to `ai/cyoda-schema-versions.md`**

Add at the end of the file:

```markdown
## v0.8.1 (dialect `"0.8"`)

The `"0.8"` dialect now targets cyoda-go **0.8.1** (0.8.0 never shipped, so a
single MAJOR.MINOR-keyed dialect can carry the new field safely).

- **`annotations` added at workflow / state / transition level.** Optional,
  engine-opaque, client-owned JSON. **Object-only** (arrays/primitives/null are
  rejected by `AnnotationsSchema`), **capped at 64 KB per field** (compacted
  UTF-8 bytes), stored and round-tripped but never interpreted by the engine.
  Modelled on the canonical `Workflow`/`State`/`Transition` (`src/types/workflow.ts`)
  and `WorkflowSchema`/`StateSchema`/`TransitionSchema` (`src/schema/workflow.ts`).
- **Parse:** `normalizeOperatorAlias` skips the `annotations` subtree (it would
  otherwise rewrite `operatorType`->`operation` inside opaque client data or throw
  on a value carrying both keys); `normalizeWorkflowInput` carries state-level
  annotations through its state rebuild.
- **Serialize:** `outputWorkflow`/`outputStates`/`outputTransition` emit
  annotations under a new `OutputOptions.annotations` flag; the `"0.8"` dialect
  passes `{ schedule: true, annotations: true }` and adds `annotations` to the
  per-level `V0_8_WIRE_FIELDS` allowlist (the inner keys are opaque and are not
  further allowlisted). The `"0.7"` dialect omits the field entirely.
- **Validation:** an `annotations-too-large` semantic error (`ANNOTATIONS_MAX_BYTES`)
  blocks a save above 64 KB before cyoda-go returns a 400, carrying a `targetId`
  so the editor can locate the offending node.
- **Open items (verify against a running 0.8.1 binary):** the exact byte boundary
  (65536 vs 64000, `>` vs `>=`); whether the server preserves annotation key order
  on reload (`json.Compact` preserves; map re-marshal sorts); whether an empty
  `{}` is round-tripped or dropped.
```

- [ ] **Step 2: Scope-correct the dialect header comment**

In `packages/workflow-core/src/dialect/cyoda-0_8.ts`, update only the two header lines that name the dialect's *current target*.

Line 8, change:

```ts
 * The cyoda-go 0.8.0 dialect — the current default (`LATEST_CYODA_VERSION`).
```

to:

```ts
 * The cyoda-go 0.8 dialect — the current default (`LATEST_CYODA_VERSION`).
 * Targets cyoda-go 0.8.1; 0.8.0 was never released.
```

Lines 10-11, change:

```ts
 * Covers: cyoda-go 0.8.0. (Not yet released as of 2026-06; see the status note
 * in `ai/cyoda-schema-versions.md`.)
```

to:

```ts
 * Covers: cyoda-go 0.8.1 (the 0.8 line; 0.8.0 never shipped — see the status
 * note in `ai/cyoda-schema-versions.md`).
```

Do **not** touch the other `v0.8.0` mentions in this file or elsewhere: they document *provenance* of behavior that genuinely landed in 0.8.0 (the strict allowlist, `internalized` reservation, and `schema/name.ts` / `validate/semantic.ts:566` "cyoda-go v0.8.0 caps every name"), which remain accurate for the 0.8 line.

- [ ] **Step 3: Create the changeset**

Create `.changeset/workflow-annotations.md`:

```markdown
---
"@cyoda/workflow-core": minor
---

Preserve and edit cyoda-go 0.8.1 `annotations` (engine-opaque, client-owned JSON
metadata) at the workflow, state, and transition levels.

Annotations are now modelled on the canonical `Workflow`/`State`/`Transition`
(`AnnotationsSchema`, object-only, 64 KB cap), round-tripped through the `"0.8"`
dialect (parse and serialize), and editable via the Monaco JSON editor
(autocomplete/validation come from the `ImportPayloadSchema`-derived schema).
Over-cap annotations are blocked pre-save with a locatable `annotations-too-large`
error. The `"0.7"` dialect continues to omit the field. Pre-1.0 minor per the 0.x
convention.
```

- [ ] **Step 4: Full package verification**

Run each and confirm PASS:

```bash
pnpm --filter @cyoda/workflow-core test
pnpm --filter @cyoda/workflow-core typecheck
pnpm --filter @cyoda/workflow-core build
pnpm lint
```

Expected: all green. If `pnpm lint` flags the new files, fix lint issues and re-run.

- [ ] **Step 5: Commit**

```bash
git add ai/cyoda-schema-versions.md packages/workflow-core/src/dialect/cyoda-0_8.ts .changeset/workflow-annotations.md
git commit -m "docs(core): document 0.8.1 annotations + add minor changeset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes carried from the spec (do not re-litigate during implementation)

- **Do not** add annotations handling to the patch system — immer structural
  edits (`Object.assign`, wholesale state moves, `replaceSession`) already
  preserve annotations through structured edits.
- **Do not** change `workflow-graph`/`layout`/`viewer`/`react` — read-only display
  and visual-driving are out of scope; annotations ride through the session.
- **Do not** emit annotations from the `"0.7"` dialect.
- Leave the 64 KB boundary, server key-order, and empty-`{}` questions as the
  documented "verify against binary" items; they do not block this work.
