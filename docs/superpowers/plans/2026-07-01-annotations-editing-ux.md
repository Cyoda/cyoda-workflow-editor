# Annotations editing UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit engine-opaque `annotations` (workflow / state / transition) in place in the inspector, as ordinary undoable edits within the existing edit/save model — no new persistence path.

**Architecture:** A new targeted `setAnnotations` patch op in `@cyoda/workflow-core` (apply + exact invert). A self-contained inline `AnnotationsField` in `@cyoda/workflow-react` — a JSON pane (Monaco when a runtime is available, `<textarea>` fallback) with Apply/Revert/Remove and a three-way buffer↔document sync — wired into the State, Transition, and Workflow inspector forms. A control-cluster button makes the workflow form discoverable.

**Tech Stack:** TypeScript (ES2022, ESM), React 18/19, Zod 4, immer, Vitest + Testing Library (jsdom), Monaco, Changesets, pnpm.

## Global Constraints

- **Branch:** this work builds on the annotations *model* (PR #43). Execute on branch `feat/workflow-annotations` (which carries the model) or a branch off it. Do not target `main`/`staging` directly.
- Annotations editing must ride the **existing edit/save model**: every edit is a `setAnnotations` patch (immediate in-memory, undoable); persistence only via the standard Save. **No annotation-specific save path.**
- `annotations` is **object-only** (reject arrays/primitives/null) and **≤ 64 KB** measured as `new TextEncoder().encode(JSON.stringify(x)).length` (compacted UTF-8 — never `String.length`).
- All buffer↔document comparisons use **value equality via `JSON.stringify`**, never raw editor text (pretty-print/whitespace must not read as a change).
- Commit messages end with a blank line then: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Run from repo root. Core tests: `pnpm --filter @cyoda/workflow-core exec vitest run <path>`. React tests: `pnpm --filter @cyoda/workflow-react exec vitest run <path>`. Typecheck: `pnpm --filter <pkg> typecheck`. Lint: `pnpm lint`.
- **Deliberate deviation from the spec's "extract a shared `JsonMonacoField`":** `AnnotationsField` is self-contained (its inline re-seed lifecycle differs fundamentally from `CriterionJsonEditor`'s modal pin-on-mount). We do **not** refactor the working criterion editor. YAGNI; revisit if a third JSON editor appears.

---

### Task 1: `setAnnotations` patch op (core) + undo label (react)

**Files:**
- Modify: `packages/workflow-core/src/types/patch.ts` (add op + `AnnotationsTarget`)
- Modify: `packages/workflow-core/src/patch/apply.ts` (apply case)
- Modify: `packages/workflow-core/src/patch/invert.ts` (invert case)
- Modify: `packages/workflow-core/src/index.ts` (export `ANNOTATIONS_MAX_BYTES`)
- Modify: `packages/workflow-react/src/state/store.ts` (`summarize` case)
- Test: `packages/workflow-core/tests/patch/annotations.test.ts` (create)

**Interfaces:**
- Consumes: `Annotations` (from `types/workflow.js`), `locateTransition`/`findWorkflow`/`findTransition`/`cloneCriterion`/`noop` (existing in `apply.ts`/`invert.ts`), `ANNOTATIONS_MAX_BYTES` (in `validate/semantic.ts`).
- Produces:
  - `DomainPatch` gains `{ op: "setAnnotations"; target: AnnotationsTarget; annotations?: Annotations }`.
  - `type AnnotationsTarget = { kind: "workflow"; workflow: string } | { kind: "state"; workflow: string; stateCode: StateCode } | { kind: "transition"; transitionUuid: string }` (exported from `types/patch.ts`).
  - `ANNOTATIONS_MAX_BYTES` re-exported from the package root.

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-core/tests/patch/annotations.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { applyPatch, invertPatch, parseImportPayload } from "../../src/index.js";
import type { DomainPatch, WorkflowEditorDocument } from "../../src/index.js";

function doc(): WorkflowEditorDocument {
  const json = JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "NEW",
        active: true,
        states: {
          NEW: { transitions: [{ name: "go", next: "DONE", manual: false }] },
          DONE: { transitions: [] },
        },
      },
    ],
  });
  return parseImportPayload(json).document!;
}

function transitionUuid(d: WorkflowEditorDocument): string {
  return Object.keys(d.meta.ids.transitions)[0]!;
}

describe("setAnnotations apply", () => {
  test("sets, replaces, and removes workflow-level annotations", () => {
    const d0 = doc();
    const set: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } };
    const d1 = applyPatch(d0, set);
    expect(d1.session.workflows[0]!.annotations).toEqual({ a: 1 });

    const replace: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { b: 2 } };
    const d2 = applyPatch(d1, replace);
    expect(d2.session.workflows[0]!.annotations).toEqual({ b: 2 });

    const remove: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" } };
    const d3 = applyPatch(d2, remove);
    expect(d3.session.workflows[0]!.annotations).toBeUndefined();
  });

  test("sets state- and transition-level annotations without touching siblings", () => {
    const d0 = doc();
    const d1 = applyPatch(d0, { op: "setAnnotations", target: { kind: "state", workflow: "wf", stateCode: "NEW" }, annotations: { s: 1 } });
    expect(d1.session.workflows[0]!.states["NEW"]!.annotations).toEqual({ s: 1 });
    expect(d1.session.workflows[0]!.states["DONE"]!.annotations).toBeUndefined();

    const uuid = transitionUuid(d1);
    const d2 = applyPatch(d1, { op: "setAnnotations", target: { kind: "transition", transitionUuid: uuid }, annotations: { t: 1 } });
    expect(d2.session.workflows[0]!.states["NEW"]!.transitions[0]!.annotations).toEqual({ t: 1 });
    expect(d2.session.workflows[0]!.states["NEW"]!.annotations).toEqual({ s: 1 });
  });
});

describe("setAnnotations invert round-trips", () => {
  test("set-over-absent inverts to remove; replace and remove invert exactly", () => {
    const d0 = doc();
    for (const [before, patch] of [
      [d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }],
      [applyPatch(d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }),
       { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { b: 2 } }],
      [applyPatch(d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }),
       { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" } }],
    ] as [WorkflowEditorDocument, DomainPatch][]) {
      const after = applyPatch(before, patch);
      const inverse = invertPatch(before, patch);
      const restored = applyPatch(after, inverse);
      expect(restored.session.workflows[0]!.annotations).toEqual(before.session.workflows[0]!.annotations);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-core exec vitest run tests/patch/annotations.test.ts`
Expected: FAIL — `setAnnotations` is not a known op (type error / no-op apply / `invertPatch` missing case). It may also fail to compile.

- [ ] **Step 3: Add the patch type**

In `packages/workflow-core/src/types/patch.ts`, add the import of `Annotations` (extend the existing `./workflow.js` type import) and add the op to the `DomainPatch` union plus the exported target type. Add after the `setCriterion` line (`patch.ts:49`):

```ts
  | { op: "setAnnotations"; target: AnnotationsTarget; annotations?: Annotations }
```

Extend the existing workflow import at the top:
```ts
import type { Annotations, StateCode, Transition, Workflow } from "./workflow.js";
```

And add, above `export type DomainPatch`:
```ts
export type AnnotationsTarget =
  | { kind: "workflow"; workflow: string }
  | { kind: "state"; workflow: string; stateCode: StateCode }
  | { kind: "transition"; transitionUuid: string };
```

- [ ] **Step 4: Add the apply case**

In `packages/workflow-core/src/patch/apply.ts`, inside the `produce(...)` switch (alongside the other `case`s, e.g. after `case "setCriterion":`), add:

```ts
      case "setAnnotations": {
        const t = patch.target;
        let host: { annotations?: Record<string, unknown> } | undefined;
        if (t.kind === "workflow") {
          host = draft.workflows.find((w) => w.name === t.workflow);
        } else if (t.kind === "state") {
          host = draft.workflows.find((w) => w.name === t.workflow)?.states[t.stateCode];
        } else {
          const loc = locateTransition(doc, t.transitionUuid);
          if (loc) {
            host = draft.workflows.find((w) => w.name === loc.workflow)?.states[loc.state]?.transitions[loc.index];
          }
        }
        if (!host) return;
        if (patch.annotations === undefined) delete host.annotations;
        else host.annotations = patch.annotations;
        return;
      }
```

(Note: `applyPatch`'s switch has **no `default`**, so a missing case is a silent no-op — that is why Step 2's test fails at runtime, not compile time. Add this case explicitly.)

- [ ] **Step 5: Add the invert case**

In `packages/workflow-core/src/patch/invert.ts`, add a case to `invertPatch` (the switch is exhaustive with no `default`, so this is required to compile). Place it near `setCriterion` (`invert.ts:175`):

```ts
    case "setAnnotations": {
      const t = patch.target;
      let prior: Record<string, unknown> | undefined;
      if (t.kind === "workflow") {
        prior = findWorkflow(doc, t.workflow)?.annotations;
      } else if (t.kind === "state") {
        prior = findWorkflow(doc, t.workflow)?.states[t.stateCode]?.annotations;
      } else {
        prior = findTransition(doc, t.transitionUuid)?.annotations;
      }
      return prior === undefined
        ? { op: "setAnnotations", target: t }
        : { op: "setAnnotations", target: t, annotations: structuredClone(prior) };
    }
```

- [ ] **Step 6: Add the undo label (react store)**

In `packages/workflow-react/src/state/store.ts`, add a case to `summarize` (exhaustive switch — required to compile), near `setCriterion` (`store.ts:58`):

```ts
    case "setAnnotations":
      return patch.annotations ? `Set annotations` : `Clear annotations`;
```

- [ ] **Step 7: Export the size cap**

In `packages/workflow-core/src/index.ts`, add `ANNOTATIONS_MAX_BYTES` to the value export from `./validate/index.js` (or wherever the validate exports are re-exported). Confirm it is exported from `validate/semantic.ts` first; if `validate/index.ts` does not re-export it, add it there, then to `src/index.ts`. It must be importable as `import { ANNOTATIONS_MAX_BYTES } from "@cyoda/workflow-core"`.

Also export the new type: add `AnnotationsTarget` to the `export type { … } from "./types/index.js"` block, and ensure `types/index.ts` re-exports it from `./patch.js`.

- [ ] **Step 8: Run tests + typecheck (both packages)**

Run:
```
pnpm --filter @cyoda/workflow-core exec vitest run tests/patch/annotations.test.ts
pnpm --filter @cyoda/workflow-core typecheck
pnpm --filter @cyoda/workflow-react typecheck
```
Expected: annotations tests PASS; both typechecks clean (the react typecheck proves the `summarize` case is present).

- [ ] **Step 9: Commit**

```bash
git add packages/workflow-core/src/types/patch.ts packages/workflow-core/src/patch/apply.ts packages/workflow-core/src/patch/invert.ts packages/workflow-core/src/index.ts packages/workflow-core/src/types/index.ts packages/workflow-react/src/state/store.ts packages/workflow-core/tests/patch/annotations.test.ts
git commit -m "feat(core): add setAnnotations patch op (apply + exact invert)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `annotationsJson` validation helper (react)

**Files:**
- Create: `packages/workflow-react/src/inspector/annotationsJson.ts`
- Test: `packages/workflow-react/tests/annotationsJson.test.ts` (create)

**Interfaces:**
- Consumes: `ANNOTATIONS_MAX_BYTES` (from `@cyoda/workflow-core`, exported in Task 1).
- Produces:
  - `interface AnnotationsJsonResult { annotations: Record<string, unknown> | null; error: string | null }`
  - `parseAnnotationsJson(text: string): AnnotationsJsonResult`
  - `annotationsModelUri(key: string): string` → `cyoda://annotations/<key>.json`
  - `sameJson(a: unknown, b: unknown): boolean` (value equality via `JSON.stringify`)

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-react/tests/annotationsJson.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseAnnotationsJson, sameJson, annotationsModelUri } from "../src/inspector/annotationsJson.js";

describe("parseAnnotationsJson", () => {
  test("accepts objects (including empty and nested)", () => {
    expect(parseAnnotationsJson("{}")).toEqual({ annotations: {}, error: null });
    expect(parseAnnotationsJson('{"a":{"b":[1,2]}}').annotations).toEqual({ a: { b: [1, 2] } });
  });
  test("rejects invalid JSON", () => {
    expect(parseAnnotationsJson("{").annotations).toBeNull();
    expect(parseAnnotationsJson("{").error).toMatch(/Invalid JSON/);
  });
  test("rejects non-objects", () => {
    for (const bad of ["null", "[]", '"s"', "3", "true"]) {
      const r = parseAnnotationsJson(bad);
      expect(r.annotations).toBeNull();
      expect(r.error).toMatch(/object/i);
    }
  });
  test("rejects over-cap annotations", () => {
    const big = JSON.stringify({ blob: "x".repeat(70_000) });
    const r = parseAnnotationsJson(big);
    expect(r.annotations).toBeNull();
    expect(r.error).toMatch(/limit/i);
  });
});

describe("sameJson", () => {
  test("compares by value, ignores whitespace", () => {
    expect(sameJson({ a: 1 }, JSON.parse("{ \"a\":  1 }"))).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});

test("annotationsModelUri namespaces distinctly from criterion", () => {
  expect(annotationsModelUri("state-NEW")).toBe("cyoda://annotations/state-NEW.json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsJson.test.ts`
Expected: FAIL — module `annotationsJson.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow-react/src/inspector/annotationsJson.ts`:

```ts
import { ANNOTATIONS_MAX_BYTES } from "@cyoda/workflow-core";

export interface AnnotationsJsonResult {
  annotations: Record<string, unknown> | null;
  error: string | null;
}

export function annotationsModelUri(key: string): string {
  return `cyoda://annotations/${key}.json`;
}

/** Compacted UTF-8 byte length — identical measure to the save-time backstop. */
export function annotationBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Value equality for JSON (ignores formatting/whitespace). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function parseAnnotationsJson(text: string): AnnotationsJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { annotations: null, error: "Invalid JSON." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { annotations: null, error: "Annotations must be a JSON object." };
  }
  const bytes = annotationBytes(raw);
  if (bytes > ANNOTATIONS_MAX_BYTES) {
    return {
      annotations: null,
      error: `Annotations are ${bytes} bytes, over the ${ANNOTATIONS_MAX_BYTES}-byte limit.`,
    };
  }
  return { annotations: raw as Record<string, unknown>, error: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsJson.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-react/src/inspector/annotationsJson.ts packages/workflow-react/tests/annotationsJson.test.ts
git commit -m "feat(react): add annotationsJson validation helper (object-only, 64KB)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `AnnotationsField` component (react)

The inline editor. jsdom has no Monaco, so tests exercise the `<textarea>` path (same as the criterion tests); the Monaco path mirrors it and is covered by the demo/manual use.

**Files:**
- Create: `packages/workflow-react/src/inspector/AnnotationsField.tsx`
- Test: `packages/workflow-react/tests/annotationsField.test.tsx` (create)

**Interfaces:**
- Consumes: `Annotations` (`@cyoda/workflow-core`), `parseAnnotationsJson`/`sameJson`/`annotationsModelUri` (Task 2), `useCriterionMonaco` (`./CriterionMonacoContext.js`), `installMonacoCancellationFilter` (`../components/monacoDisposal.js`), style tokens (`../style/tokens.js`), Monaco types (`WorkflowJsonEditorInstance`, `WorkflowJsonModelLike` from `@cyoda/workflow-monaco`).
- Produces: `AnnotationsField(props: { value: Annotations | undefined; disabled: boolean; modelKey: string; onCommit: (next: Annotations) => void; onRemove: () => void })`.

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-react/tests/annotationsField.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { AnnotationsField } from "../src/inspector/AnnotationsField.js";

afterEach(cleanup);

// No CriterionMonacoProvider → useCriterionMonaco() returns null → textarea path.

test("absent value shows Add button; clicking dispatches setAnnotations({})", () => {
  const onCommit = vi.fn();
  render(<AnnotationsField value={undefined} disabled={false} modelKey="k" onCommit={onCommit} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-add"));
  expect(onCommit).toHaveBeenCalledWith({});
});

test("editing to a valid changed object enables Apply and commits the parsed object", () => {
  const onCommit = vi.fn();
  render(<AnnotationsField value={{}} disabled={false} modelKey="k" onCommit={onCommit} onRemove={vi.fn()} />);
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: '{"role":"reviewer"}' } });
  const apply = screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement;
  expect(apply.disabled).toBe(false);
  fireEvent.click(apply);
  expect(onCommit).toHaveBeenCalledWith({ role: "reviewer" });
});

test("Apply is disabled when unchanged and when invalid", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  const apply = () => screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement;
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  expect(apply().disabled).toBe(true); // unchanged
  fireEvent.change(ta, { target: { value: "{ not json" } });
  expect(apply().disabled).toBe(true); // invalid
  expect(screen.getByTestId("annotations-error")).toBeTruthy();
  fireEvent.change(ta, { target: { value: "[]" } });
  expect(screen.getByTestId("annotations-error").textContent).toMatch(/object/i);
});

test("Remove dispatches setAnnotations(undefined) via onRemove", () => {
  const onRemove = vi.fn();
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={onRemove} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-remove"));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("Revert restores the buffer to value and re-disables Apply", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: '{"a":2}' } });
  fireEvent.click(screen.getByTestId("inspector-annotations-revert"));
  expect(JSON.parse(ta.value)).toEqual({ a: 1 });
  expect((screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement).disabled).toBe(true);
});

test("three-way sync: clean buffer re-seeds on external value change; echo is a no-op; dirty buffer is kept", () => {
  const { rerender } = render(
    <AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />,
  );
  const ta = () => screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;

  // Clean buffer + external change (e.g. undo) → re-seed.
  rerender(<AnnotationsField value={{ a: 9 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 9 });

  // Dirty buffer + external change → keep buffer, show "document changed" note.
  fireEvent.change(ta(), { target: { value: '{"a":100}' } });
  rerender(<AnnotationsField value={{ a: 55 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 100 });
  expect(screen.getByTestId("annotations-doc-changed")).toBeTruthy();

  // Echo: value becomes deep-equal to the current (dirty) buffer → no note, buffer unchanged.
  rerender(<AnnotationsField value={{ a: 100 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 100 });
  expect(screen.queryByTestId("annotations-doc-changed")).toBeNull();
});

test("read-only (disabled) shows no Add/Apply/Remove", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={true} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(screen.queryByTestId("inspector-annotations-apply")).toBeNull();
  expect(screen.queryByTestId("inspector-annotations-remove")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsField.test.tsx`
Expected: FAIL — `AnnotationsField` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/workflow-react/src/inspector/AnnotationsField.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Annotations } from "@cyoda/workflow-core";
import type { WorkflowJsonEditorInstance, WorkflowJsonModelLike } from "@cyoda/workflow-monaco";
import { useCriterionMonaco } from "./CriterionMonacoContext.js";
import { installMonacoCancellationFilter } from "../components/monacoDisposal.js";
import { annotationsModelUri, parseAnnotationsJson, sameJson } from "./annotationsJson.js";
import { colors, fonts, radii } from "../style/tokens.js";

const pretty = (v: unknown): string => JSON.stringify(v, null, 2);

export interface AnnotationsFieldProps {
  value: Annotations | undefined;
  disabled: boolean;
  modelKey: string;
  onCommit: (next: Annotations) => void;
  onRemove: () => void;
}

export function AnnotationsField(props: AnnotationsFieldProps) {
  if (props.value === undefined) {
    return (
      <div style={sectionStyle}>
        <SectionLabel />
        {!props.disabled && (
          <button
            type="button"
            style={primaryBtn}
            data-testid="inspector-annotations-add"
            onClick={() => props.onCommit({})}
          >
            Add annotations
          </button>
        )}
      </div>
    );
  }
  // Key on modelKey so switching nodes fully remounts the editor state.
  return <AnnotationsEditor key={props.modelKey} {...props} value={props.value} />;
}

function AnnotationsEditor({
  value,
  disabled,
  modelKey,
  onCommit,
  onRemove,
}: AnnotationsFieldProps & { value: Annotations }) {
  const monaco = useCriterionMonaco();
  const [buffer, setBuffer] = useState<string>(() => pretty(value));
  const [docChanged, setDocChanged] = useState(false);
  const prevValueRef = useRef<Annotations>(value);

  // Three-way sync when the document's `value` changes underneath.
  useEffect(() => {
    if (sameJson(prevValueRef.current, value)) return; // value prop identity changed but same content
    const parsed = parseAnnotationsJson(buffer).annotations;
    if (parsed !== null && sameJson(parsed, value)) {
      // In-sync / echo (e.g. our own Apply round-tripped): no-op.
      setDocChanged(false);
    } else if (parsed !== null && sameJson(parsed, prevValueRef.current)) {
      // External change, buffer clean → re-seed.
      setBuffer(pretty(value));
      setDocChanged(false);
    } else {
      // External change, buffer dirty (or invalid) → keep buffer, warn.
      setDocChanged(true);
    }
    prevValueRef.current = value;
  }, [value, buffer]);

  const result = parseAnnotationsJson(buffer);
  const dirty = result.annotations !== null && !sameJson(result.annotations, value);
  const applyEnabled = !disabled && result.annotations !== null && dirty;

  const apply = () => {
    if (!applyEnabled || result.annotations === null) return;
    onCommit(result.annotations);
    setDocChanged(false);
  };
  const revert = () => {
    setBuffer(pretty(value));
    setDocChanged(false);
  };

  return (
    <div style={sectionStyle}>
      <SectionLabel />
      {monaco ? (
        <MonacoJsonPane
          monaco={monaco}
          buffer={buffer}
          disabled={disabled}
          modelUri={annotationsModelUri(modelKey)}
          onChange={setBuffer}
        />
      ) : (
        <textarea
          value={buffer}
          disabled={disabled}
          rows={12}
          data-testid="annotations-json-editor"
          style={textareaStyle}
          onChange={(e) => setBuffer(e.target.value)}
        />
      )}
      {result.error && (
        <div role="alert" data-testid="annotations-error" style={errorStyle}>
          {result.error}
        </div>
      )}
      {docChanged && (
        <div role="alert" data-testid="annotations-doc-changed" style={warnStyle}>
          Document changed underneath — Revert to reload.
        </div>
      )}
      {!disabled && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={apply}
            disabled={!applyEnabled}
            style={applyEnabled ? primaryBtn : disabledBtn}
            data-testid="inspector-annotations-apply"
          >
            Apply
          </button>
          <button type="button" onClick={revert} disabled={!dirty} style={ghostBtn} data-testid="inspector-annotations-revert">
            Revert
          </button>
          <button type="button" onClick={onRemove} style={dangerBtn} data-testid="inspector-annotations-remove">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Controlled Monaco JSON pane: buffer state is the source of truth. */
function MonacoJsonPane({
  monaco,
  buffer,
  disabled,
  modelUri,
  onChange,
}: {
  monaco: NonNullable<ReturnType<typeof useCriterionMonaco>>;
  buffer: string;
  disabled: boolean;
  modelUri: string;
  onChange: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<WorkflowJsonEditorInstance | null>(null);
  const modelRef = useRef<WorkflowJsonModelLike | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;
    const model: WorkflowJsonModelLike = monaco.editor.createModel(buffer, "json", monaco.Uri.parse(modelUri));
    modelRef.current = model;
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
    installMonacoCancellationFilter();
    const sub = model.onDidChangeContent(() => onChange(model.getValue()));
    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
      model.dispose();
      modelRef.current = null;
    };
    // eslint note: created once per modelUri; external buffer changes are pushed below.
  }, [monaco, modelUri]);

  // Push external buffer changes (re-seed/revert) into the model without echoing.
  useEffect(() => {
    const model = modelRef.current;
    if (model && model.getValue() !== buffer) model.setValue(buffer);
  }, [buffer]);

  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: disabled });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      data-testid="annotations-json-editor"
      style={{ height: 220, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}
    />
  );
}

function SectionLabel() {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textSecondary }}>
      Annotations
    </span>
  );
}

const sectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const textareaStyle: React.CSSProperties = {
  fontFamily: fonts.mono, fontSize: 12, padding: 8, minHeight: 180,
  border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: "white", resize: "vertical",
};
const ghostBtn: React.CSSProperties = { padding: "6px 10px", background: "white", border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: colors.primary, color: "white", borderColor: colors.primary };
const disabledBtn: React.CSSProperties = { ...primaryBtn, opacity: 0.5, cursor: "not-allowed" };
const dangerBtn: React.CSSProperties = { ...ghostBtn, background: colors.dangerBg, borderColor: colors.dangerBorder, color: colors.danger };
const errorStyle: React.CSSProperties = { color: colors.danger, fontSize: 11 };
const warnStyle: React.CSSProperties = { color: colors.warning, fontSize: 11 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsField.test.tsx`
Expected: PASS (all cases). If the three-way test fails, re-check the effect's `sameJson` branch order (echo → clean → dirty) and that the effect deps are `[value, buffer]`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @cyoda/workflow-react typecheck` (Expected: clean.)
```bash
git add packages/workflow-react/src/inspector/AnnotationsField.tsx packages/workflow-react/tests/annotationsField.test.tsx
git commit -m "feat(react): AnnotationsField inline editor (Apply/Revert/Remove + doc sync)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire `AnnotationsField` into the three forms

**Files:**
- Modify: `packages/workflow-react/src/inspector/StateForm.tsx` (above the Delete button)
- Modify: `packages/workflow-react/src/inspector/TransitionForm.tsx` (new section, after Processors)
- Modify: `packages/workflow-react/src/inspector/WorkflowForm.tsx` (bottom)
- Test: `packages/workflow-react/tests/annotationsFormIntegration.test.tsx` (create)

**Interfaces:**
- Consumes: `AnnotationsField` (Task 3), `setAnnotations` patch (Task 1). Each form already receives `onDispatch: (patch: DomainPatch) => void`.
- Produces: annotations editing rendered in each form, dispatching `setAnnotations` with the correct target.

- [ ] **Step 1: Write the failing test**

Create `packages/workflow-react/tests/annotationsFormIntegration.test.tsx`:

```tsx
import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { State, Workflow } from "@cyoda/workflow-core";
import { WorkflowForm } from "../src/inspector/WorkflowForm.js";
import { StateForm } from "../src/inspector/StateForm.js";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";

afterEach(cleanup);

const wf: Workflow = { version: "1.0", name: "wf", initialState: "NEW", active: true, states: { NEW: { transitions: [] } } };
const wrap = (ui: React.ReactNode) => render(<I18nContext.Provider value={defaultMessages}>{ui}</I18nContext.Provider>);

test("WorkflowForm: Add annotations dispatches setAnnotations for the workflow", () => {
  const onDispatch = vi.fn();
  wrap(<WorkflowForm workflow={wf} disabled={false} onDispatch={onDispatch} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-add"));
  expect(onDispatch).toHaveBeenCalledWith({
    op: "setAnnotations",
    target: { kind: "workflow", workflow: "wf" },
    annotations: {},
  });
});

test("StateForm: annotations field renders above the Delete button", () => {
  const state: State = { transitions: [] };
  const onDispatch = vi.fn();
  wrap(
    <StateForm workflow={wf} stateCode="NEW" state={state} disabled={false} onDispatch={onDispatch} onRequestDelete={vi.fn()} />,
  );
  const add = screen.getByTestId("inspector-annotations-add");
  const del = screen.getByTestId("inspector-state-delete");
  // Add appears before Delete in document order.
  expect(add.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(add);
  expect(onDispatch).toHaveBeenCalledWith({
    op: "setAnnotations",
    target: { kind: "state", workflow: "wf", stateCode: "NEW" },
    annotations: {},
  });
});
```

(`I18nContext` + `defaultMessages` is the exact provider pattern the existing inspector tests use, e.g. `tests/criterionModal.test.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsFormIntegration.test.tsx`
Expected: FAIL — no `inspector-annotations-add` rendered by the forms.

- [ ] **Step 3: Wire WorkflowForm**

In `packages/workflow-react/src/inspector/WorkflowForm.tsx`, import the field and render it as the last child inside the `FieldGroup` (after the initialState `TextField`, before `</FieldGroup>`):

```tsx
import { AnnotationsField } from "./AnnotationsField.js";
```
```tsx
      <AnnotationsField
        value={workflow.annotations}
        disabled={disabled}
        modelKey={`workflow-${workflow.name}`}
        onCommit={(annotations) =>
          onDispatch({ op: "setAnnotations", target: { kind: "workflow", workflow: workflow.name }, annotations })
        }
        onRemove={() =>
          onDispatch({ op: "setAnnotations", target: { kind: "workflow", workflow: workflow.name } })
        }
      />
```

- [ ] **Step 4: Wire StateForm (above Delete)**

In `packages/workflow-react/src/inspector/StateForm.tsx`, import the field and render it **immediately before** the `Delete state…` button (`StateForm.tsx:109-117`):

```tsx
import { AnnotationsField } from "./AnnotationsField.js";
```
```tsx
      <AnnotationsField
        value={state.annotations}
        disabled={disabled}
        modelKey={`state-${workflow.name}-${stateCode}`}
        onCommit={(annotations) =>
          onDispatch({ op: "setAnnotations", target: { kind: "state", workflow: workflow.name, stateCode }, annotations })
        }
        onRemove={() =>
          onDispatch({ op: "setAnnotations", target: { kind: "state", workflow: workflow.name, stateCode } })
        }
      />
      <button
        type="button"
        onClick={onRequestDelete}
        ...
```

- [ ] **Step 5: Wire TransitionForm (new section, after Processors)**

In `packages/workflow-react/src/inspector/TransitionForm.tsx`, import the field and add a new `TransitionSection` after the Processors section (near the end of the returned JSX, before the closing wrapper). The component receives `transition`, `transitionUuid`, `disabled`, `onDispatch`:

```tsx
import { AnnotationsField } from "./AnnotationsField.js";
```
```tsx
      <TransitionSection title="Annotations" testId="inspector-transition-annotations-section">
        <AnnotationsField
          value={transition.annotations}
          disabled={disabled}
          modelKey={`transition-${transitionUuid}`}
          onCommit={(annotations) =>
            onDispatch({ op: "setAnnotations", target: { kind: "transition", transitionUuid }, annotations })
          }
          onRemove={() =>
            onDispatch({ op: "setAnnotations", target: { kind: "transition", transitionUuid } })
          }
        />
      </TransitionSection>
```

- [ ] **Step 6: Run tests + typecheck**

Run:
```
pnpm --filter @cyoda/workflow-react exec vitest run tests/annotationsFormIntegration.test.tsx
pnpm --filter @cyoda/workflow-react typecheck
```
Expected: PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add packages/workflow-react/src/inspector/StateForm.tsx packages/workflow-react/src/inspector/TransitionForm.tsx packages/workflow-react/src/inspector/WorkflowForm.tsx packages/workflow-react/tests/annotationsFormIntegration.test.tsx
git commit -m "feat(react): render AnnotationsField in state/transition/workflow forms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Workflow-settings control-cluster button

**Files:**
- Modify: `packages/workflow-react/src/components/Canvas.tsx` (add a `CtrlBtn` + `WorkflowSettingsIcon`)
- Test: `packages/workflow-react/tests/canvasWorkflowSettings.test.tsx` (create)

**Interfaces:**
- Consumes: existing `CtrlBtn`, `onSelectionChange`, `activeWorkflow` (all in scope in `Canvas.tsx` around the control cluster, `Canvas.tsx:1757–1815`).
- Produces: a `data-testid="canvas-workflow-settings"` button that selects the workflow.

- [ ] **Step 1: Write the failing test**

Because `Canvas` requires a React Flow provider and layout, test the behavior at the `WorkflowEditor` level or via a focused render. Simplest reliable check: render the editor and assert the button exists and, on click, the workflow inspector form appears. Create `packages/workflow-react/tests/canvasWorkflowSettings.test.tsx`:

```tsx
import { test, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkflowEditor } from "../src/index.js";
import { parseImportPayload } from "@cyoda/workflow-core";

afterEach(cleanup);

const doc = parseImportPayload(
  JSON.stringify({
    importMode: "MERGE",
    workflows: [{ version: "1.0", name: "wf", initialState: "NEW", active: true, states: { NEW: { transitions: [] } } }],
  }),
).document!;

test("workflow-settings button selects the workflow and shows the workflow form", () => {
  render(<WorkflowEditor document={doc} mode="editor" />);
  fireEvent.click(screen.getByTestId("canvas-workflow-settings"));
  expect(screen.getByTestId("inspector-workflow-name")).toBeTruthy();
});
```

(`WorkflowEditor` needs only `document`; `mode="editor"` matches the working full-editor render in `tests/criterionModal.test.tsx`. The load-bearing assertion: click `canvas-workflow-settings` → `inspector-workflow-name` appears.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/canvasWorkflowSettings.test.tsx`
Expected: FAIL — no `canvas-workflow-settings` button.

- [ ] **Step 3: Add the button + icon**

In `packages/workflow-react/src/components/Canvas.tsx`, inside the control-cluster `div` (after the Help `CtrlBtn` block, `Canvas.tsx:1807-1814`), add:

```tsx
            <div style={{ height: 1, background: "#E2E8F0" }} />
            <CtrlBtn
              onClick={() =>
                onSelectionChange(activeWorkflow ? { kind: "workflow", workflow: activeWorkflow } : null)
              }
              title="Workflow settings"
              testId="canvas-workflow-settings"
            >
              <WorkflowSettingsIcon />
            </CtrlBtn>
```

Add the icon near the other icon components (e.g. beside `HelpIcon`):

```tsx
function WorkflowSettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" fill="white" />
      <circle cx="15" cy="12" r="2" fill="white" />
      <circle cx="8" cy="18" r="2" fill="white" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cyoda/workflow-react exec vitest run tests/canvasWorkflowSettings.test.tsx`
Expected: PASS. If React Flow rendering makes the full-editor test flaky in jsdom, fall back to asserting only that the button exists and calls `onSelectionChange` — but prefer the end-to-end assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow-react/src/components/Canvas.tsx packages/workflow-react/tests/canvasWorkflowSettings.test.tsx
git commit -m "feat(react): add workflow-settings control-cluster button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Changesets + full verification

**Files:**
- Create: `.changeset/annotations-editing-ux.md`

**Interfaces:** none.

- [ ] **Step 1: Create the changeset**

Create `.changeset/annotations-editing-ux.md`:

```markdown
---
"@cyoda/workflow-core": minor
"@cyoda/workflow-react": minor
---

Edit `annotations` in place in the inspector.

Adds a `setAnnotations` patch op to `@cyoda/workflow-core` (targeted, exact
inverse) and an inline `AnnotationsField` to `@cyoda/workflow-react` — a
scoped JSON editor (Monaco or textarea) with Apply/Revert/Remove — wired into
the state, transition, and workflow inspector forms, plus a control-cluster
button that surfaces the workflow form. Editing is an ordinary undoable edit
committed via the standard Save flow; no annotation-specific persistence.
```

- [ ] **Step 2: Full verification (both packages)**

Run each and confirm PASS:
```
pnpm --filter @cyoda/workflow-core test
pnpm --filter @cyoda/workflow-react test
pnpm --filter @cyoda/workflow-core typecheck
pnpm --filter @cyoda/workflow-react typecheck
pnpm --filter @cyoda/workflow-core build
pnpm --filter @cyoda/workflow-react build
pnpm lint
```
Expected: all green. Fix any lint issues introduced by the new files and re-run.

- [ ] **Step 3: Commit**

```bash
git add .changeset/annotations-editing-ux.md
git commit -m "chore(changeset): annotations editing UX (core + react minor)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes carried from the spec (do not re-litigate during implementation)

- **No annotation-specific save path.** Editing is `setAnnotations` patches; persistence only via the standard Save (validity-gated by `errorCount`, diff-confirmed, concurrency-guarded). `annotations-too-large` already gates Save.
- **Add commits `{}` immediately** (structural add). Accepted trade-off: an unused `{}` persists if the user Adds → doesn't type → Saves; mitigated by Remove and the Save diff.
- **Discoverability is on-inspection** (no graph badges) — known debt.
- Do **not** refactor `CriterionJsonEditor` / build a shared primitive (see Global Constraints).
- Unapplied buffer is lost on node switch (form remounts per selection) — accepted, mitigated by the dirty state; same as the criterion modal.
