# Criterion JSON Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the structured criterion "assembly" builder with a JSON-only editor (Monaco when a runtime is available, plain textarea fallback), validated against the `Criterion` schema plus the builder's strictness rules; remove the now-dead field-hint API.

**Architecture:** A small `CriterionJsonEditor` (workflow-react) edits one criterion as JSON. It gets a Monaco runtime forwarded from `WorkflowEditor` through a new React context; with no runtime it falls back to a `<textarea>`. A new `registerCriterionSchema` (workflow-monaco) lights up live schema squiggles. The Apply gate reuses `criterionBlockingError`, relocated into `@cyoda/workflow-core`. The builder and its field-hint plumbing (`hintProvider`, `EntityFieldHintProvider`, `FieldHint`) are deleted — a coordinated breaking change that also reworks `apps/docs-embed-demo`.

**Tech Stack:** TypeScript, React 19, zod 4 (`z.toJSONSchema`), Monaco (injected by the host app, never bundled), Vitest + @testing-library/react.

## Global Constraints

- Monorepo packages: `@cyoda/workflow-core`, `@cyoda/workflow-monaco`, `@cyoda/workflow-react`. pnpm workspace. Run a single package's tests with `pnpm --filter @cyoda/<pkg> test` (script is `vitest run`; append `-- <pattern>` to filter by test file). Typecheck with `pnpm --filter @cyoda/<pkg> typecheck`.
- Monaco is an **optional peer dependency**, never imported directly. The host app passes a runtime object. Two layered interfaces: `MonacoLike` (schema/markers only) and `WorkflowJsonMonacoRuntime` (adds model/editor creation). The criterion editor needs the **rich** `WorkflowJsonMonacoRuntime`.
- The `Criterion` data model, the `setCriterion` patch (`{ op: "setCriterion", host, path: ["criterion"], criterion }`), and all downstream consumers are **unchanged**.
- Operators stay deliberately permissive in the schema (`z.string().min(1)`, issue #22). Strictness lives in `criterionBlockingError`, not the schema.
- `CriterionSchema` requires non-empty `jsonPath` / `conditions` / function `name`: **there is no schema-valid empty criterion**. "Add" intentionally opens an incomplete `simple` skeleton with Apply blocked until filled.
- Keep `CriterionSection`'s export name and prop shape stable — `TransitionForm` must not need changes.
- ESM imports use `.js` extensions (TS NodeNext). Match the surrounding code's style.

---

## File Structure

**Create**
- `packages/workflow-core/src/criteria/criterionBlockingError.ts` — relocated strictness gate (pure).
- `packages/workflow-core/tests/criterionBlockingError.test.ts`
- `packages/workflow-monaco/src/criterionSchema.ts` — `registerCriterionSchema`, `criterionJsonSchema`, `CRITERION_SCHEMA_URI`.
- `packages/workflow-monaco/src/runtime.ts` — relocated Monaco runtime types.
- `packages/workflow-monaco/tests/criterionSchema.test.ts`
- `packages/workflow-react/src/components/monacoDisposal.ts` — shared StrictMode "Canceled" suppression.
- `packages/workflow-react/src/inspector/CriterionMonacoContext.tsx` — context carrying the rich runtime.
- `packages/workflow-react/src/inspector/CriterionJsonEditor.tsx` — the JSON editor (Monaco + textarea).
- `packages/workflow-react/src/inspector/criterionJson.ts` — pure `parseCriterionJson` validation helper.
- `packages/workflow-react/tests/criterionJson.test.ts`
- `packages/workflow-react/tests/criterionJsonEditor.test.tsx`

**Modify**
- `packages/workflow-core/src/criteria/index.ts`, `packages/workflow-core/src/index.ts` — export the relocated gate; remove `EntityFieldHintProvider`/`FieldHint` exports.
- `packages/workflow-monaco/src/index.ts` — export criterion schema + runtime types.
- `packages/workflow-react/src/components/WorkflowJsonEditor.tsx` — import runtime types + disposal helper from new homes.
- `packages/workflow-react/src/components/WorkflowEditor.tsx` — provide `CriterionMonacoContext`; drop `hintProvider`.
- `packages/workflow-react/src/inspector/Inspector.tsx` — drop `hintProvider` + `FieldHintsProvider`.
- `packages/workflow-react/src/inspector/CriterionForm.tsx` — gut the builder; rework summary card + modal to host `CriterionJsonEditor`.
- `packages/workflow-react/src/index.ts` — drop `EntityFieldHintProvider`/`FieldHint` re-exports.
- `packages/workflow-react/src/i18n/en.ts` (+ other locale files) — drop builder-only keys; add a couple of editor keys.
- `apps/docs-embed-demo/src/pages/CriteriaEditorPage.tsx` — drop `hintProvider`; refresh copy.

**Delete**
- `packages/workflow-react/src/inspector/criteria/JsonPathInput.tsx`
- `packages/workflow-react/src/inspector/criteria/FieldHintsContext.tsx`
- `packages/workflow-react/src/inspector/criteria/fieldLabels.ts`
- `apps/docs-embed-demo/src/lib/entityHints.ts`
- Obsolete builder tests (see Tasks 6–7).

---

## Task 1: Relocate the strictness gate into workflow-core

**Files:**
- Create: `packages/workflow-core/src/criteria/criterionBlockingError.ts`
- Test: `packages/workflow-core/tests/criterionBlockingError.test.ts`
- Modify: `packages/workflow-core/src/criteria/index.ts`, `packages/workflow-core/src/index.ts`

**Interfaces:**
- Consumes: `OPERATOR_VALUE_SHAPE` (`./operators.js`), `OperatorType` (`../types/operator.js`), `OperatorValue` + `Criterion` (`../types/criterion.js`), `NAME_REGEX` (`../schema/name.js`), `validateJsonPathSubset` (`./jsonPathSubset.js`).
- Produces: `criterionBlockingError(criterion: Criterion): string | null` — recursive; returns the first human-readable blocking message, or `null` when the criterion is committable.

This is a verbatim relocation of the builder's logic (`CriterionForm.tsx:1760-1812`) made self-contained. The builder keeps its private copy until Task 6 deletes it — temporary duplication is acceptable and resolves there.

- [ ] **Step 1: Write the failing test**

```ts
// packages/workflow-core/tests/criterionBlockingError.test.ts
import { describe, it, expect } from "vitest";
import { criterionBlockingError } from "../src/index.js";
import type { Criterion } from "../src/index.js";

describe("criterionBlockingError", () => {
  it("passes a complete simple criterion", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.status", operation: "EQUALS", value: "OK" };
    expect(criterionBlockingError(c)).toBeNull();
  });

  it("blocks an empty jsonPath", () => {
    const c: Criterion = { type: "simple", jsonPath: "", operation: "EQUALS", value: "x" };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("blocks an unsupported jsonPath expression", () => {
    const c: Criterion = { type: "simple", jsonPath: "$..deep", operation: "EQUALS", value: "x" };
    expect(criterionBlockingError(c)).toMatch(/JSON path is invalid/);
  });

  it("blocks a scalar operator with no value", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.a", operation: "EQUALS" };
    expect(criterionBlockingError(c)).toBe("Value is required.");
  });

  it("blocks BETWEEN without a 2-element array", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.a", operation: "BETWEEN", value: [1] };
    expect(criterionBlockingError(c)).toMatch(/BETWEEN requires/);
  });

  it("blocks an invalid function name", () => {
    const c: Criterion = { type: "function", function: { name: "" } };
    expect(criterionBlockingError(c)).toBe("Function name is invalid.");
  });

  it("recurses into a function precheck", () => {
    const c: Criterion = {
      type: "function",
      function: { name: "myFn", criterion: { type: "simple", jsonPath: "", operation: "EQUALS" } },
    };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("recurses into group conditions and reports the first failure", () => {
    const c: Criterion = {
      type: "group",
      operator: "AND",
      conditions: [
        { type: "simple", jsonPath: "$.ok", operation: "EQUALS", value: "y" },
        { type: "simple", jsonPath: "", operation: "EQUALS", value: "y" },
      ],
    };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("validates only jsonPath for array criteria", () => {
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags", operation: "CONTAINS", value: [] })).toBeNull();
    expect(criterionBlockingError({ type: "array", jsonPath: "", operation: "CONTAINS", value: [] })).toBe("Choose a field for this condition.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core test -- criterionBlockingError`
Expected: FAIL — `criterionBlockingError` is not exported.

- [ ] **Step 3: Create the module**

```ts
// packages/workflow-core/src/criteria/criterionBlockingError.ts
import type { Criterion } from "../types/criterion.js";
import type { OperatorType } from "../types/operator.js";
import type { OperatorValue } from "../types/criterion.js";
import { NAME_REGEX } from "../schema/name.js";
import { OPERATOR_VALUE_SHAPE, type OperatorValueShape } from "./operators.js";
import { validateJsonPathSubset } from "./jsonPathSubset.js";

function shapeOf(op: OperatorValue): OperatorValueShape {
  return OPERATOR_VALUE_SHAPE[op as OperatorType] ?? "scalar";
}

function formatScalar(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function jsonPathBlockingError(jsonPath: string): string | null {
  if (jsonPath === "") return "Choose a field for this condition.";
  const check = validateJsonPathSubset(jsonPath);
  return check.ok ? null : `JSON path is invalid (${check.reason}).`;
}

function rangeBlockingError(operation: OperatorValue, value: unknown): string | null {
  if (operation !== "BETWEEN" && operation !== "BETWEEN_INCLUSIVE") return null;
  return Array.isArray(value) &&
    value.length === 2 &&
    formatScalar(value[0]).trim() !== "" &&
    formatScalar(value[1]).trim() !== ""
    ? null
    : "BETWEEN requires both Low and High values.";
}

/**
 * First human-readable reason this criterion may not be committed, or null if
 * it is committable. Recurses into `group.conditions` and `function.criterion`.
 * Mirrors the rules the old structured builder enforced; the JSON schema stays
 * deliberately permissive (issue #22), so this is where strictness lives.
 */
export function criterionBlockingError(criterion: Criterion): string | null {
  switch (criterion.type) {
    case "simple": {
      const pathError = jsonPathBlockingError(criterion.jsonPath);
      if (pathError) return pathError;
      if (
        shapeOf(criterion.operation) === "scalar" &&
        (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
      ) {
        return "Value is required.";
      }
      return rangeBlockingError(criterion.operation, criterion.value);
    }
    case "array":
      return jsonPathBlockingError(criterion.jsonPath);
    case "lifecycle":
      if (!NAME_REGEX.test(criterion.field)) return null;
      if (
        shapeOf(criterion.operation) === "scalar" &&
        (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
      ) {
        return "Value is required.";
      }
      return rangeBlockingError(criterion.operation, criterion.value);
    case "function":
      if (!criterion.function.name || !NAME_REGEX.test(criterion.function.name)) {
        return "Function name is invalid.";
      }
      return criterion.function.criterion
        ? criterionBlockingError(criterion.function.criterion)
        : null;
    case "group":
      for (const child of criterion.conditions) {
        const childError = criterionBlockingError(child);
        if (childError) return childError;
      }
      return null;
  }
}
```

- [ ] **Step 4: Export it**

In `packages/workflow-core/src/criteria/index.ts`, add after the `validateJsonPathSubset` export:

```ts
export { criterionBlockingError } from "./criterionBlockingError.js";
```

In `packages/workflow-core/src/index.ts`, confirm `criteria/index.js` re-exports flow to the root (the file already re-exports `validateJsonPathSubset`, `OPERATOR_VALUE_SHAPE`, etc. from `./criteria/...`). Add `criterionBlockingError` to the same criteria re-export group if the root lists names explicitly.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-core test -- criterionBlockingError`
Expected: PASS (all cases).

- [ ] **Step 6: Run the full core suite (no regressions)**

Run: `pnpm --filter @cyoda/workflow-core test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-core/src/criteria/criterionBlockingError.ts \
  packages/workflow-core/tests/criterionBlockingError.test.ts \
  packages/workflow-core/src/criteria/index.ts packages/workflow-core/src/index.ts
git commit -m "feat(core): relocate criterionBlockingError strictness gate into workflow-core"
```

---

## Task 2: Criterion JSON schema registration (workflow-monaco)

**Files:**
- Create: `packages/workflow-monaco/src/criterionSchema.ts`
- Test: `packages/workflow-monaco/tests/criterionSchema.test.ts`
- Modify: `packages/workflow-monaco/src/index.ts`

**Interfaces:**
- Consumes: `CriterionSchema` (`@cyoda/workflow-core`), `JsonSchemaHandle` + `MonacoLike` (`./types.js`).
- Produces:
  - `CRITERION_SCHEMA_URI: string`
  - `criterionJsonSchema(): object`
  - `registerCriterionSchema(monaco: MonacoLike, opts?: { fileMatchPrefix?: string; schemaUri?: string }): JsonSchemaHandle`

Mirrors `schema.ts` exactly, with a distinct URI + `cyoda://criterion/` prefix so it coexists with the workflow schema in the one shared `jsonDefaults`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/workflow-monaco/tests/criterionSchema.test.ts
import { describe, it, expect } from "vitest";
import {
  criterionJsonSchema,
  registerCriterionSchema,
  CRITERION_SCHEMA_URI,
  registerWorkflowSchema,
} from "../src/index.js";
import type { MonacoLike, JsonDiagnosticsOptions } from "../src/types.js";

function fakeMonaco(): MonacoLike {
  const state: { opts: JsonDiagnosticsOptions } = { opts: { schemas: [] } };
  return {
    editor: { setModelMarkers: () => {} },
    languages: {
      json: {
        jsonDefaults: {
          get diagnosticsOptions() { return state.opts; },
          setDiagnosticsOptions(next) { state.opts = next; },
        },
      },
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  };
}

describe("criterionJsonSchema", () => {
  it("generates a JSON schema with a recursive criterion union", () => {
    const schema = criterionJsonSchema() as Record<string, unknown>;
    // z.toJSONSchema on the lazy union emits anyOf at the root.
    expect(Array.isArray(schema.anyOf)).toBe(true);
    // The whole thing must serialize (recursive $ref must not throw).
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it("validates a nested group criterion when checked with a JSON-schema validator", () => {
    // Smoke check that recursion resolves: stringify round-trips and contains a self ref.
    const schema = JSON.stringify(criterionJsonSchema());
    expect(schema).toContain("$ref");
  });
});

describe("registerCriterionSchema", () => {
  it("installs under the criterion URI + prefix", () => {
    const monaco = fakeMonaco();
    const handle = registerCriterionSchema(monaco);
    expect(handle.schemaUri).toBe(CRITERION_SCHEMA_URI);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.some((s) => s.fileMatch?.[0] === "cyoda://criterion/*")).toBe(true);
    handle.dispose();
    expect(monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!.some(
      (s) => s.uri === CRITERION_SCHEMA_URI,
    )).toBe(false);
  });

  it("coexists with the workflow schema in one jsonDefaults", () => {
    const monaco = fakeMonaco();
    registerWorkflowSchema(monaco);
    registerCriterionSchema(monaco);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-monaco test -- criterionSchema`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Create the module**

```ts
// packages/workflow-monaco/src/criterionSchema.ts
import { CriterionSchema } from "@cyoda/workflow-core";
import * as z from "zod";
import type { JsonSchemaHandle, MonacoLike } from "./types.js";

export const CRITERION_SCHEMA_URI = "https://cyoda.dev/schemas/criterion.schema.json";

/**
 * JSON Schema for a single criterion, generated from the Zod `CriterionSchema`
 * (a recursive lazy union). zod 4's native `z.toJSONSchema` emits a root
 * `anyOf` with recursive `$ref:"#"` for nested groups / function prechecks.
 */
export function criterionJsonSchema(): object {
  return z.toJSONSchema(CriterionSchema, { target: "draft-7" });
}

/**
 * Register the criterion JSON schema with Monaco's JSON language service so
 * in-editor schema validation lights up on any URI under `cyoda://criterion/`.
 * Coexists with the workflow schema (distinct URI + fileMatch). Idempotent.
 */
export function registerCriterionSchema(
  monaco: MonacoLike,
  opts: { fileMatchPrefix?: string; schemaUri?: string } = {},
): JsonSchemaHandle {
  const fileMatchPrefix = opts.fileMatchPrefix ?? "cyoda://criterion/";
  const schemaUri = opts.schemaUri ?? CRITERION_SCHEMA_URI;
  const schema = criterionJsonSchema();

  const existing = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas ?? [];
  const kept = existing.filter((s) => s.uri !== schemaUri);
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    ...monaco.languages.json.jsonDefaults.diagnosticsOptions,
    validate: true,
    allowComments: false,
    schemas: [...kept, { uri: schemaUri, fileMatch: [`${fileMatchPrefix}*`], schema }],
  });

  return {
    schemaUri,
    fileMatchPrefix,
    dispose: () => {
      const current = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas ?? [];
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        ...monaco.languages.json.jsonDefaults.diagnosticsOptions,
        schemas: current.filter((s) => s.uri !== schemaUri),
      });
    },
  };
}
```

- [ ] **Step 4: Export from the index**

In `packages/workflow-monaco/src/index.ts`, add at the top:

```ts
export { registerCriterionSchema, criterionJsonSchema, CRITERION_SCHEMA_URI } from "./criterionSchema.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-monaco test -- criterionSchema`
Expected: PASS.

- [ ] **Step 6: Run the full monaco suite**

Run: `pnpm --filter @cyoda/workflow-monaco test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-monaco/src/criterionSchema.ts \
  packages/workflow-monaco/tests/criterionSchema.test.ts \
  packages/workflow-monaco/src/index.ts
git commit -m "feat(monaco): add registerCriterionSchema for criterion JSON validation"
```

---

## Task 3: Relocate the Monaco runtime types + share the disposal helper

**Files:**
- Create: `packages/workflow-monaco/src/runtime.ts`
- Create: `packages/workflow-react/src/components/monacoDisposal.ts`
- Modify: `packages/workflow-monaco/src/index.ts`, `packages/workflow-react/src/components/WorkflowJsonEditor.tsx`

**Interfaces:**
- Produces (monaco): `MonacoUriLike`, `WorkflowJsonModelLike`, `WorkflowJsonEditorInstance`, `WorkflowJsonMonacoRuntime` (types).
- Produces (react): `suppressMonacoDisposalRejections(windowMs?: number): void`.

Pure refactor — no behavior change. `WorkflowJsonEditor.tsx` currently both defines the runtime types and owns the StrictMode "Canceled" suppression. Move the types to workflow-monaco (their natural home, no React/DOM dep) and the suppression to a shared react module so `CriterionJsonEditor` can reuse it. Re-export the types from `WorkflowJsonEditor.tsx` so the existing `workflow-react` index re-exports keep working.

- [ ] **Step 1: Create the runtime types module**

```ts
// packages/workflow-monaco/src/runtime.ts
import type { EditorLike, MonacoLike, TextModelLike } from "./types.js";

export interface MonacoUriLike {
  toString(): string;
}

export interface WorkflowJsonModelLike extends TextModelLike {
  dispose(): void;
}

export interface WorkflowJsonEditorInstance extends EditorLike {
  dispose(): void;
  layout?: () => void;
  updateOptions?: (options: Record<string, unknown>) => void;
}

export interface WorkflowJsonMonacoRuntime extends MonacoLike {
  Uri: { parse(value: string): MonacoUriLike };
  editor: MonacoLike["editor"] & {
    createModel(value: string, language?: string, uri?: MonacoUriLike): WorkflowJsonModelLike;
    create(element: HTMLElement, options: Record<string, unknown>): WorkflowJsonEditorInstance;
  };
}
```

- [ ] **Step 2: Export the runtime types from the monaco index**

In `packages/workflow-monaco/src/index.ts`, add:

```ts
export type {
  MonacoUriLike,
  WorkflowJsonModelLike,
  WorkflowJsonEditorInstance,
  WorkflowJsonMonacoRuntime,
} from "./runtime.js";
```

- [ ] **Step 3: Create the shared disposal helper**

```ts
// packages/workflow-react/src/components/monacoDisposal.ts
// Monaco's editor.dispose() cancels internal async operations which surface as
// "Canceled" unhandled promise rejections — most visibly under React StrictMode's
// double-invoke cleanup. This shared helper suppresses ONLY those rejections,
// ONLY during the brief disposal window. Dev-only noise; no production effect.
let active = 0;
let installed = false;

function ensureInstalled(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("unhandledrejection", (e) => {
    if (
      active > 0 &&
      (e.reason?.name === "Canceled" || String(e.reason).startsWith("Canceled"))
    ) {
      e.preventDefault();
    }
  });
}

/** Open a ~`windowMs` window during which Monaco "Canceled" rejections are swallowed. */
export function suppressMonacoDisposalRejections(windowMs = 100): void {
  ensureInstalled();
  active++;
  window.setTimeout(() => { active--; }, windowMs);
}
```

- [ ] **Step 4: Rewire `WorkflowJsonEditor.tsx` to the new homes**

Replace the local runtime-type definitions (lines ~41-70) and the module-level disposal block (lines ~22-37). At the top of the file, import from the new homes and re-export the types for API stability:

```ts
import { suppressMonacoDisposalRejections } from "./monacoDisposal.js";
export type {
  MonacoUriLike,
  WorkflowJsonModelLike,
  WorkflowJsonEditorInstance,
  WorkflowJsonMonacoRuntime,
} from "@cyoda/workflow-monaco";
```

Delete the `let _monacoDisposalCount = 0;` block and the four `export interface ...Runtime/Model/Instance/UriLike` definitions. In the cleanup function, replace:

```ts
      _monacoDisposalCount++;
      window.setTimeout(() => { _monacoDisposalCount--; }, 100);
```

with:

```ts
      suppressMonacoDisposalRejections();
```

`WorkflowJsonEditorConfig`, `JsonEditStatus`, and the component stay in this file unchanged.

- [ ] **Step 5: Run the affected suites to verify no regressions**

Run: `pnpm --filter @cyoda/workflow-monaco test && pnpm --filter @cyoda/workflow-react test -- jsonEditorIntegration`
Expected: PASS (types resolve; the JSON editor integration test still passes).

- [ ] **Step 6: Typecheck both packages**

Run: `pnpm --filter @cyoda/workflow-monaco typecheck && pnpm --filter @cyoda/workflow-react typecheck` (or the repo's `typecheck` script if present)
Expected: no type errors; the `workflow-react` index re-exports of the runtime types still resolve (now via the re-export in `WorkflowJsonEditor.tsx`).

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-monaco/src/runtime.ts packages/workflow-monaco/src/index.ts \
  packages/workflow-react/src/components/monacoDisposal.ts \
  packages/workflow-react/src/components/WorkflowJsonEditor.tsx
git commit -m "refactor(monaco): relocate runtime types; share Monaco disposal helper"
```

---

## Task 4: Criterion Monaco context + provider wiring

**Files:**
- Create: `packages/workflow-react/src/inspector/CriterionMonacoContext.tsx`
- Modify: `packages/workflow-react/src/components/WorkflowEditor.tsx`

**Interfaces:**
- Produces:
  - `CriterionMonacoProvider: React.Provider<WorkflowJsonMonacoRuntime | null>`
  - `useCriterionMonaco(): WorkflowJsonMonacoRuntime | null`

- [ ] **Step 1: Create the context**

```tsx
// packages/workflow-react/src/inspector/CriterionMonacoContext.tsx
import { createContext, useContext } from "react";
import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-monaco";

const CriterionMonacoContext = createContext<WorkflowJsonMonacoRuntime | null>(null);

export const CriterionMonacoProvider = CriterionMonacoContext.Provider;

/** The Monaco runtime forwarded by WorkflowEditor, or null when none is configured. */
export function useCriterionMonaco(): WorkflowJsonMonacoRuntime | null {
  return useContext(CriterionMonacoContext);
}
```

- [ ] **Step 2: Provide it from `WorkflowEditor`**

In `packages/workflow-react/src/components/WorkflowEditor.tsx`, add the import:

```ts
import { CriterionMonacoProvider } from "../inspector/CriterionMonacoContext.js";
```

Wrap the editor's returned JSX tree in the provider, valued from the existing `jsonEditor` prop (already in scope at line ~173). The provider should sit high enough to enclose the `<Inspector>` render (line ~1079). Wrap the outermost returned element:

```tsx
return (
  <CriterionMonacoProvider value={jsonEditor?.monaco ?? null}>
    {/* existing returned tree */}
  </CriterionMonacoProvider>
);
```

(If the component has multiple returns, wrap the main editor return that contains `<Inspector>`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cyoda/workflow-react typecheck`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/workflow-react/src/inspector/CriterionMonacoContext.tsx \
  packages/workflow-react/src/components/WorkflowEditor.tsx
git commit -m "feat(react): forward Monaco runtime to the inspector via CriterionMonacoContext"
```

---

## Task 5: `parseCriterionJson` + `CriterionJsonEditor`

**Files:**
- Create: `packages/workflow-react/src/inspector/criterionJson.ts`
- Create: `packages/workflow-react/src/inspector/CriterionJsonEditor.tsx`
- Test: `packages/workflow-react/tests/criterionJson.test.ts`
- Test: `packages/workflow-react/tests/criterionJsonEditor.test.tsx`

**Interfaces:**
- Consumes: `useCriterionMonaco` (Task 4), `registerCriterionSchema`/`CRITERION_SCHEMA_URI` (Task 2), `suppressMonacoDisposalRejections` (Task 3), `criterionBlockingError` + `CriterionSchema` + `Criterion` (core).
- Produces:
  - `parseCriterionJson(text: string): { criterion: Criterion | null; error: string | null }`
  - `criterionModelUri(key: string): string`
  - `CriterionJsonEditor` component with props `{ value: Criterion; disabled: boolean; modelKey: string; onChange(result: { criterion: Criterion | null; error: string | null }): void }`

### Step group A — the pure validator

- [ ] **Step 1: Write the failing test**

```ts
// packages/workflow-react/tests/criterionJson.test.ts
import { describe, it, expect } from "vitest";
import { parseCriterionJson } from "../src/inspector/criterionJson.js";

describe("parseCriterionJson", () => {
  it("accepts a valid criterion", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"$.a","operation":"EQUALS","value":"x"}');
    expect(r.error).toBeNull();
    expect(r.criterion).toEqual({ type: "simple", jsonPath: "$.a", operation: "EQUALS", value: "x" });
  });

  it("rejects malformed JSON", () => {
    const r = parseCriterionJson("{ not json");
    expect(r.criterion).toBeNull();
    expect(r.error).toMatch(/JSON/i);
  });

  it("rejects schema-invalid JSON (missing discriminant)", () => {
    const r = parseCriterionJson('{"jsonPath":"$.a"}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it("rejects a structurally-valid but incomplete criterion via the strictness gate", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"","operation":"EQUALS"}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBe("Choose a field for this condition.");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm --filter @cyoda/workflow-react test -- criterionJson.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

```ts
// packages/workflow-react/src/inspector/criterionJson.ts
import type { Criterion } from "@cyoda/workflow-core";
import { CriterionSchema, criterionBlockingError } from "@cyoda/workflow-core";

export interface CriterionJsonResult {
  criterion: Criterion | null;
  error: string | null;
}

export function criterionModelUri(key: string): string {
  return `cyoda://criterion/${key}.json`;
}

/** Three-stage gate: JSON.parse -> CriterionSchema.safeParse -> criterionBlockingError. */
export function parseCriterionJson(text: string): CriterionJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { criterion: null, error: "Invalid JSON." };
  }
  const parsed = CriterionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? ` at ${first.path.join(".")}` : "";
    return { criterion: null, error: `${first?.message ?? "Invalid criterion"}${path}` };
  }
  const blocking = criterionBlockingError(parsed.data);
  if (blocking) return { criterion: null, error: blocking };
  return { criterion: parsed.data, error: null };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `pnpm --filter @cyoda/workflow-react test -- criterionJson.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-react/src/inspector/criterionJson.ts packages/workflow-react/tests/criterionJson.test.ts
git commit -m "feat(react): add parseCriterionJson validation gate"
```

### Step group B — the component

- [ ] **Step 6: Write the failing component test (textarea fallback path)**

`CriterionJsonEditor` with no Monaco runtime in context renders a textarea and reports validity through `onChange`.

```tsx
// packages/workflow-react/tests/criterionJsonEditor.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Criterion } from "@cyoda/workflow-core";
import { CriterionJsonEditor } from "../src/inspector/CriterionJsonEditor.js";

afterEach(cleanup);

const valid: Criterion = { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: "x" };

describe("CriterionJsonEditor (textarea fallback)", () => {
  it("renders a textarea when no Monaco runtime is present", () => {
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={() => {}} />);
    expect(screen.getByTestId("criterion-json-editor")).toBeTruthy();
  });

  it("reports a valid criterion on mount", () => {
    const onChange = vi.fn();
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith({ criterion: valid, error: null });
  });

  it("reports an error when edited to invalid JSON", () => {
    const onChange = vi.fn();
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("criterion-json-editor"), { target: { value: "{ broken" } });
    expect(onChange).toHaveBeenLastCalledWith({ criterion: null, error: expect.stringMatching(/JSON/i) });
  });

  it("disables the textarea when disabled", () => {
    render(<CriterionJsonEditor value={valid} disabled modelKey="t1" onChange={() => {}} />);
    expect((screen.getByTestId("criterion-json-editor") as HTMLTextAreaElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 7: Run it — verify it fails**

Run: `pnpm --filter @cyoda/workflow-react test -- criterionJsonEditor`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement the component**

```tsx
// packages/workflow-react/src/inspector/CriterionJsonEditor.tsx
import { useEffect, useRef } from "react";
import type { Criterion } from "@cyoda/workflow-core";
import {
  registerCriterionSchema,
  type WorkflowJsonModelLike,
  type WorkflowJsonEditorInstance,
} from "@cyoda/workflow-monaco";
import { useCriterionMonaco } from "./CriterionMonacoContext.js";
import { suppressMonacoDisposalRejections } from "../components/monacoDisposal.js";
import { parseCriterionJson, criterionModelUri, type CriterionJsonResult } from "./criterionJson.js";
import { colors, fonts, radii } from "../style/tokens.js";

export interface CriterionJsonEditorProps {
  value: Criterion;
  disabled: boolean;
  modelKey: string;
  onChange: (result: CriterionJsonResult) => void;
}

export function CriterionJsonEditor({ value, disabled, modelKey, onChange }: CriterionJsonEditorProps) {
  const monaco = useCriterionMonaco();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialText = useRef(JSON.stringify(value, null, 2)).current;

  if (monaco) {
    return (
      <MonacoCriterionEditor
        monaco={monaco}
        initialText={initialText}
        disabled={disabled}
        modelKey={modelKey}
        onChangeRef={onChangeRef}
      />
    );
  }
  return (
    <TextareaCriterionEditor
      initialText={initialText}
      disabled={disabled}
      onChangeRef={onChangeRef}
    />
  );
}

function TextareaCriterionEditor({
  initialText,
  disabled,
  onChangeRef,
}: {
  initialText: string;
  disabled: boolean;
  onChangeRef: React.MutableRefObject<(r: CriterionJsonResult) => void>;
}) {
  // Report initial validity once.
  useEffect(() => {
    onChangeRef.current(parseCriterionJson(initialText));
  }, [initialText, onChangeRef]);

  return (
    <textarea
      defaultValue={initialText}
      disabled={disabled}
      rows={16}
      data-testid="criterion-json-editor"
      style={jsonTextAreaStyle}
      onChange={(e) => onChangeRef.current(parseCriterionJson(e.target.value))}
    />
  );
}

function MonacoCriterionEditor({
  monaco,
  initialText,
  disabled,
  modelKey,
  onChangeRef,
}: {
  monaco: NonNullable<ReturnType<typeof useCriterionMonaco>>;
  initialText: string;
  disabled: boolean;
  modelKey: string;
  onChangeRef: React.MutableRefObject<(r: CriterionJsonResult) => void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<WorkflowJsonEditorInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;
    const model: WorkflowJsonModelLike = monaco.editor.createModel(
      initialText,
      "json",
      monaco.Uri.parse(criterionModelUri(modelKey)),
    );
    const editor = monaco.editor.create(containerRef.current, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      theme: "vs",
      readOnly: disabled,
    });
    editorRef.current = editor;
    const schemaHandle = registerCriterionSchema(monaco);

    const report = () => onChangeRef.current(parseCriterionJson(model.getValue()));
    report(); // initial validity
    const sub = model.onDidChangeContent(report);

    return () => {
      suppressMonacoDisposalRejections();
      sub.dispose();
      schemaHandle.dispose();
      editor.dispose();
      editorRef.current = null;
      model.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, modelKey]);

  // Reflect disabled changes onto the live editor.
  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: disabled });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      data-testid="criterion-json-editor"
      style={{ height: 320, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}
    />
  );
}

const jsonTextAreaStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 12,
  padding: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: colors.border,
  borderRadius: radii.sm,
  background: "white",
  resize: "vertical",
};
```

- [ ] **Step 9: Run it — verify it passes**

Run: `pnpm --filter @cyoda/workflow-react test -- criterionJsonEditor`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/workflow-react/src/inspector/CriterionJsonEditor.tsx packages/workflow-react/tests/criterionJsonEditor.test.tsx
git commit -m "feat(react): add CriterionJsonEditor (Monaco + textarea fallback)"
```

---

## Task 6: Rework `CriterionForm` — summary card + JSON modal; delete the builder

**Files:**
- Modify: `packages/workflow-react/src/inspector/CriterionForm.tsx`
- Modify: `packages/workflow-react/tests/criterionModal.test.tsx`
- Delete: `packages/workflow-react/tests/criterionSimple.test.tsx`, `criterionGroup.test.tsx`, `criterionLifecycle.test.tsx`, `criterionFunction.test.tsx`, `criterionArray.test.tsx`
- Check: `packages/workflow-react/tests/automatedOrderingInspector.test.tsx`, `issueBadge.test.tsx`

**Interfaces:**
- Consumes: `CriterionJsonEditor` + `parseCriterionJson` (Task 5).
- Produces: `CriterionSection` — **unchanged export name and prop shape** (`host`, `stateCode`, `transitionName`, `targetState`, `manual`, `criterion`, `disabled`, `onDispatch`, `onSelectionChange`).

The rewrite keeps `CriterionSection`, `CriterionSummaryCard` (reworked), `CriterionEditorModal` (gutted), `defaultCriterion`, `cloneCriterion`, `ChevronIcon` (if still used; otherwise drop), `SectionHeader`, and the styles those need. Everything from `CriterionEditorBody` downward (the builder: `CriterionBuilder`, `RuleEditorPanel`, `RuleGroupBlock`, field forms, `AddConditionMenu`, `PlainEnglishPreview`, `CriterionSummary`, `summarizeCriterionReadable`, the local `criterionBlockingError`/`jsonPathBlockingError`/`rangeBlockingError`/`shapeOf`/`formatScalar`/`parseScalar`/value-kind helpers, `JsonPathInput`/`useFieldHints` usage) is deleted.

- [ ] **Step 1: Rewrite the modal to host `CriterionJsonEditor`**

Replace `CriterionEditorModal` (lines ~235-402) with a JSON-only version. New body:

```tsx
function CriterionEditorModal({
  title,
  context,
  host,
  path,
  initialCriterion,
  disabled,
  onDispatch,
  onCancel,
  onApplied,
}: {
  title: string;
  context: string;
  host: HostRef;
  path: string[];
  initialCriterion: Criterion | undefined;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
  onCancel: () => void;
  onApplied: () => void;
}) {
  const messages = useMessages();
  const seed = initialCriterion ?? defaultCriterion("simple");
  const [result, setResult] = useState<CriterionJsonResult>(() =>
    parseCriterionJson(JSON.stringify(seed)),
  );
  const modelKey = criterionModelKey(host);
  const applyDisabled = disabled || result.criterion === null;

  const apply = () => {
    if (applyDisabled || !result.criterion) return;
    onDispatch({ op: "setCriterion", host, path, criterion: result.criterion });
    onApplied();
  };

  return (
    <ModalFrame onCancel={onCancel} labelledBy="criterion-modal-title">
      <div style={modalStyle} data-testid="criterion-editor-modal">
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="criterion-modal-title" style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 12, color: colors.textTertiary }}>{context}</p>
        </header>

        <div style={modalBodyStyle}>
          <CriterionJsonEditor
            value={seed}
            disabled={disabled}
            modelKey={modelKey}
            onChange={setResult}
          />
        </div>

        {result.error && (
          <div role="alert" style={errorStyle} data-testid="criterion-modal-blocking-error">
            {result.error}
          </div>
        )}

        <footer style={modalFooterStyle}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onCancel} style={ghostBtn} data-testid="criterion-modal-cancel">
            {messages.criterion.cancel}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={applyDisabled}
            style={applyDisabled ? disabledPrimaryBtn : primaryBtn}
            data-testid="criterion-modal-apply"
          >
            {messages.criterion.applyModal}
          </button>
        </footer>
      </div>
    </ModalFrame>
  );
}

function criterionModelKey(host: HostRef): string {
  if (host.kind === "transition") return `transition-${host.transitionUuid}`;
  if (host.kind === "processor") return `processor-${host.processorUuid}`;
  return `host-${host.workflow}`;
}
```

Add imports at the top of the file:

```ts
import { CriterionJsonEditor } from "./CriterionJsonEditor.js";
import { parseCriterionJson, type CriterionJsonResult } from "./criterionJson.js";
```

(Adjust `criterionModelKey` to the real `HostRef` shape — check `host.kind` variants in `@cyoda/workflow-core`. The only requirement is a deterministic string.)

- [ ] **Step 2: Rework the summary card to show type badge + compact JSON**

Replace `<CriterionSummary criterion={criterion} />` (line ~210) with a compact JSON line. Replace the `CriterionSummary` component (lines ~1708+) — delete it and add:

```tsx
function CriterionCompactJson({ criterion }: { criterion: Criterion }) {
  const text = JSON.stringify(criterion);
  const display = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  return (
    <code
      data-testid="criterion-compact-json"
      style={{
        display: "block",
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.textSecondary,
        background: colors.surfaceMuted ?? "#F8FAFC",
        padding: "6px 8px",
        borderRadius: radii.sm,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {display}
    </code>
  );
}
```

Use it in `CriterionSummaryCard`'s "set" branch (the `SectionHeader badge={criterion.type}` already shows the type badge):

```tsx
      <SectionHeader label={m.heading} badge={criterion.type} />
      <CriterionCompactJson criterion={criterion} />
```

(If `colors.surfaceMuted` does not exist, use a literal like `"#F8FAFC"` consistent with nearby styles.)

- [ ] **Step 3: Delete the builder code and now-unused imports**

In `CriterionForm.tsx` delete: `CriterionEditorBody`, `CriterionBuilder`, `RuleGroupBlock`, `RuleEditorPanel`, every per-type field form, `AddConditionMenu`, `PlainEnglishPreview`, `summarizeCriterionReadable`, the local `criterionBlockingError`/`jsonPathBlockingError`/`rangeBlockingError`/`shapeOf`/`formatScalar`/`parseScalar`, the value-kind helpers, and any styles only they referenced. Remove the now-unused imports:

```ts
// remove:
import { useFieldHints } from "./criteria/FieldHintsContext.js";
import { JsonPathInput } from "./criteria/JsonPathInput.js";
// and remove unused names from the @cyoda/workflow-core import group:
//   NAME_REGEX, OPERATOR_GROUPS, OPERATOR_VALUE_SHAPE, SUPPORTED_SIMPLE_OPERATORS,
//   UNSUPPORTED_OPERATORS, validateJsonPathSubset, FieldHint, OperatorType, OperatorValue,
//   ArrayCriterion, FunctionCriterion, GroupCriterion, LifecycleCriterion, SimpleCriterion,
//   JsonPathRejectReason  — keep only what the trimmed file still uses (Criterion, DomainPatch, HostRef).
```

Keep `defaultCriterion`, `cloneCriterion`, `SectionHeader`, `CriterionSection`, `CriterionSummaryCard`, and the styles still referenced.

- [ ] **Step 4: Rewrite `criterionModal.test.tsx` for the JSON flow**

The existing file drives the form. Rewrite its body to exercise the JSON modal. Keep its document/harness setup; replace form-interaction assertions with:

```tsx
it("opens the JSON modal and applies a valid edited criterion", () => {
  // ...render TransitionForm/WorkflowEditor harness, select a transition, click Add/Edit...
  fireEvent.click(screen.getByTestId("inspector-criterion-add"));
  const editor = screen.getByTestId("criterion-json-editor") as HTMLTextAreaElement;
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ type: "simple", jsonPath: "$.status", operation: "EQUALS", value: "OK" }) },
  });
  fireEvent.click(screen.getByTestId("criterion-modal-apply"));
  // assert onDispatch / document received setCriterion with the parsed criterion
});

it("blocks Apply on invalid JSON", () => {
  // ...open modal...
  fireEvent.change(screen.getByTestId("criterion-json-editor"), { target: { value: "{ broken" } });
  expect((screen.getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId("criterion-modal-blocking-error")).toBeTruthy();
});
```

(These tests run with no Monaco runtime in context → textarea path, `data-testid="criterion-json-editor"`.)

- [ ] **Step 5: Delete the obsolete builder test files**

```bash
git rm packages/workflow-react/tests/criterionSimple.test.tsx \
  packages/workflow-react/tests/criterionGroup.test.tsx \
  packages/workflow-react/tests/criterionLifecycle.test.tsx \
  packages/workflow-react/tests/criterionFunction.test.tsx \
  packages/workflow-react/tests/criterionArray.test.tsx
```

- [ ] **Step 6: Fix `automatedOrderingInspector` / `issueBadge` if they touch the builder**

Run those two tests; if they only add/inspect criteria through the summary card + `setCriterion` they pass unchanged. If any assert on builder-only testids (e.g. `criterion-builder`, `criterion-plain-summary`), update them to the JSON flow (or to assert via `criterion-compact-json`).

Run: `pnpm --filter @cyoda/workflow-react test -- automatedOrderingInspector issueBadge`
Expected: PASS (after any needed edits).

- [ ] **Step 7: Run the criterion + inspector tests**

Run: `pnpm --filter @cyoda/workflow-react test -- criterionModal criterionJsonEditor criterionJson`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/workflow-react/src/inspector/CriterionForm.tsx packages/workflow-react/tests/
git commit -m "feat(react)!: replace criterion builder with JSON editor modal + compact summary"
```

---

## Task 7: Delete the criteria builder dir + remove the dead field-hint API

**Files:**
- Delete: `packages/workflow-react/src/inspector/criteria/JsonPathInput.tsx`, `FieldHintsContext.tsx`, `fieldLabels.ts`
- Delete: `packages/workflow-react/tests/jsonPathHints.test.tsx`, `fieldLabels.test.ts`
- Modify: `packages/workflow-react/src/inspector/Inspector.tsx`, `packages/workflow-react/src/components/WorkflowEditor.tsx`, `packages/workflow-react/src/index.ts`, `packages/workflow-core/src/index.ts` (+ `src/types/` export site), `packages/workflow-react/src/i18n/en.ts` (+ other locales)

**Interfaces:**
- Removes (public, breaking): `WorkflowEditor`/`Inspector` `hintProvider` prop; `EntityFieldHintProvider` and `FieldHint` exports from `@cyoda/workflow-core` and `@cyoda/workflow-react`.

- [ ] **Step 1: Delete the builder-support files and their tests**

```bash
git rm packages/workflow-react/src/inspector/criteria/JsonPathInput.tsx \
  packages/workflow-react/src/inspector/criteria/FieldHintsContext.tsx \
  packages/workflow-react/src/inspector/criteria/fieldLabels.ts \
  packages/workflow-react/tests/jsonPathHints.test.tsx \
  packages/workflow-react/tests/fieldLabels.test.ts
```

- [ ] **Step 2: Strip `hintProvider` from `Inspector.tsx`**

Remove the `EntityFieldHintProvider` import (line ~4), the `FieldHintsProvider` import (line ~17), the `hintProvider` prop (line ~33), and the `<FieldHintsProvider>` wrapper (lines ~79/216) — render its children directly.

- [ ] **Step 3: Strip `hintProvider` from `WorkflowEditor.tsx`**

Remove the `EntityFieldHintProvider` type import (line ~9), the `hintProvider?` prop (line ~105), the destructured `hintProvider` (line ~175), and the `{...(hintProvider ? { hintProvider } : {})}` spread on `<Inspector>` (line ~1089).

- [ ] **Step 4: Remove the public type exports**

In `packages/workflow-react/src/index.ts`, delete line ~28:

```ts
export type { EntityFieldHintProvider, FieldHint } from "@cyoda/workflow-core";
```

In `packages/workflow-core/src/index.ts`, remove `EntityFieldHintProvider` (line ~14) and `FieldHint` (line ~21) from the export group, and delete their definitions/`export` in `packages/workflow-core/src/types/` (find with `grep -rn "EntityFieldHintProvider\|FieldHint" packages/workflow-core/src`). If they live in `src/types/api.ts`, remove those interface blocks and any now-unused imports.

- [ ] **Step 5: Trim builder-only i18n keys**

In `packages/workflow-react/src/i18n/en.ts` (and every sibling locale file under `src/i18n/`), remove keys only the builder used: `type`, `field`, `fieldHelper`, `fieldPathLabel`, `fieldPathHelper`, `rawJsonPathToggle`, `rawJsonPathHelper`, `fieldNotListed`, `operation`, `value`, `low`, `high`, `advanced`, `editJson`, `backToForm`, `preview`, `changeType`, `chooseConditionType`, `types`, and any others not referenced after Task 6. Keep `heading`, `addTitle`, `editTitle`, `add`, `edit`, `remove`, `noneManual`, `noneAutomated`, `noneAutomatedWarning`, `cancel`, `applyModal`. Drive this with the compiler (next step) — remove keys flagged unused / restore any still referenced.

- [ ] **Step 6: Typecheck the whole repo and fix fallout**

Run: `grep -rn "hintProvider\|EntityFieldHintProvider\|FieldHint\|useFieldHints\|FieldHintsProvider" packages/ --include=*.ts --include=*.tsx | grep -v dist`
Expected: no source references remain (tests already removed in Task 6/this task).

Run: `pnpm --filter @cyoda/workflow-core typecheck && pnpm --filter @cyoda/workflow-react typecheck`
Expected: no type errors (the i18n key removals reconcile against the `Messages` type — fix any mismatches).

- [ ] **Step 7: Run the full react + core suites**

Run: `pnpm --filter @cyoda/workflow-core test && pnpm --filter @cyoda/workflow-react test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A packages/
git commit -m "feat!: remove dead field-hint API (hintProvider, EntityFieldHintProvider, FieldHint)"
```

---

## Task 8: Rework the docs-embed-demo

**Files:**
- Modify: `apps/docs-embed-demo/src/pages/CriteriaEditorPage.tsx`
- Delete: `apps/docs-embed-demo/src/lib/entityHints.ts`

**Interfaces:** consumes the now-published packages; provides a demo of the JSON editor.

- [ ] **Step 1: Remove the hint provider from the page**

In `CriteriaEditorPage.tsx`: delete the `createSampleHintProvider` import (line ~17) and the `tradeEntitySample` import if it becomes unused; delete the `hintProvider` `useMemo` (lines ~62-72); remove `hintProvider={hintProvider}` from both `<WorkflowEditor>` instances (lines ~180, ~300); drop the `{ label: "Hint provider", value: "sample-backed" }` stat (lines ~210). Refresh copy that referenced JSONPath autocomplete (lines ~196, ~281-286) to describe the JSON editor instead.

- [ ] **Step 2: Ensure the clean view still demos the JSON editor**

The harness `<WorkflowEditor>` already passes `jsonEditor={{ monaco, modelUri }}` (lines ~296-299) → the criterion modal uses Monaco there. The "clean" instance (lines ~176-184) passes no `jsonEditor` → it exercises the textarea fallback (intentional contrast; leave as-is, or add a `jsonEditor` config to showcase Monaco there too).

- [ ] **Step 3: Delete the now-orphaned hint helper**

```bash
git rm apps/docs-embed-demo/src/lib/entityHints.ts
```

- [ ] **Step 4: Build the demo app**

Run: `pnpm --filter @cyoda/docs-embed-demo build` (use the app's actual package name; check `apps/docs-embed-demo/package.json`)
Expected: builds with no references to the removed API.

- [ ] **Step 5: Grep the app for stragglers**

Run: `grep -rn "hintProvider\|EntityFieldHintProvider\|FieldHint\|entityHints" apps/docs-embed-demo/src`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add apps/docs-embed-demo/
git commit -m "chore(demo): drop field-hint usage; showcase the criterion JSON editor"
```

---

## Final verification

- [ ] **All package suites pass:** `pnpm --filter @cyoda/workflow-core test && pnpm --filter @cyoda/workflow-monaco test && pnpm --filter @cyoda/workflow-react test`
- [ ] **All builds pass:** core, monaco, react, and the demo app.
- [ ] **No dead references:** `grep -rn "hintProvider\|EntityFieldHintProvider\|FieldHint\|criterion-builder\|CriterionBuilder\|JsonPathInput\|FieldHints" packages/ apps/ --include=*.ts --include=*.tsx | grep -v dist` returns nothing.
- [ ] **Manual smoke (Monaco path):** run the demo, open a transition criterion → confirm syntax highlighting + schema squiggles on a deliberately wrong criterion, Apply blocked, then a valid edit applies and updates the graph badge + exported JSON. This is the path with no automated coverage (the test fakes don't run the JSON language service).
- [ ] **Changesets / version bump:** add a changeset marking the breaking removal of `hintProvider` / `EntityFieldHintProvider` / `FieldHint` (major) across `@cyoda/workflow-core`, `@cyoda/workflow-monaco`, `@cyoda/workflow-react`, per `ai/npm-release-mechanism.md`. Note the required `cyoda-dev-console` follow-up (drop its `hintProvider` usage).

---

## Notes for the implementer

- **TDD per task:** failing test → minimal code → green → commit. Don't batch.
- **The breaking change is only the field-hint API removal.** The JSON-editor swap is internal/additive.
- **No automated coverage for live Monaco squiggles/validation** — the test fakes don't run the JSON language service. The pure `parseCriterionJson` + `criterionBlockingError` + `criterionJsonSchema` tests cover the logic; Monaco rendering is covered by the final manual smoke only.
- **Squiggle noise is expected:** the criterion schema is a 5-branch `anyOf`; Monaco's JSON service reports against the nearest branch, not "invalid group." Acceptable; an `if/then` discriminated schema is a possible follow-up.
- **Keep `CriterionSection`'s prop shape** — `TransitionForm` must stay untouched.
