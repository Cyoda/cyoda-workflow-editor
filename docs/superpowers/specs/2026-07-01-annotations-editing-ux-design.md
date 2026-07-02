# Annotations editing UX — in-place, within the standard edit/save model

**Date:** 2026-07-01
**Packages:** `@cyoda/workflow-react` (the UI) + `@cyoda/workflow-core` (one new patch op)
**Depends on:** the annotations model (PR #43 / `@cyoda/workflow-core` 0.4.0 — `Annotations`, `AnnotationsSchema`, three-level `annotations`, `ANNOTATIONS_MAX_BYTES`). This branches off that work.
**Status:** Design (v2 — incorporates independent review), awaiting review

## Problem

The annotations model is preserved and validated, but the **only** way to edit annotations today is the whole-config Monaco JSON editor (`WorkflowJsonEditor`), and the inspector's per-node JSON view (`Inspector.tsx` → `JsonPreview`) is **read-only and gated on developer mode** (`Inspector.tsx:198`, `developerMode && effectiveTab === "json"`). So a non-developer-mode user can't see annotations at all, and editing one transition's annotation means hand-editing the entire workflow JSON blob.

Give annotations **in-place, per-node editing** — and do it as an ordinary participant in the editor's existing edit/save model, not a special case.

## Governing principle — no special-casing

The controlling constraint (verified in the code): **annotations editing must go through the same edit/save lifecycle as every other edit. There is no annotation-specific persistence path.**

The editor's model (`state/store.ts`, `patch/*`, `save/useSaveFlow.ts`, `WorkflowEditor.tsx`):

1. **Working copy.** Every user edit is a patch → a new in-memory `WorkflowEditorDocument`. Nothing persists automatically, and **nothing is held aside for a separate save** — edits live in the working copy and are undoable. (JSON-valued fields such as a criterion batch keystrokes behind an **Apply** that produces one ordinary patch; the batching is a UI affordance, the resulting patch is a normal in-memory edit — not a persistence-staging concept.)
2. **Explicit, deliberate Save.** A Save button → confirmation modal with a diff summary (`save/diff.ts`, `save/SaveConfirmModal.tsx`); REPLACE/ACTIVATE require explicit confirm; then `api.importWorkflows`.
3. **Validity-gated.** `saveDisabled = readOnly || errorCount > 0 || saveBlockedByJson` (`WorkflowEditor.tsx:368`) — a config with semantic errors or invalid JSON cannot be saved.
4. **Optimistic concurrency.** Save carries a concurrency token; a 409 → conflict banner → force-overwrite or reload.
5. **Undo/redo** over the in-memory edit history.

Everything below is derived from making annotations obey this model exactly.

> **Terminology — "commit" vs "save".** *Commit* = apply a patch to the in-memory document (visible immediately, undoable, marks the doc dirty). It does **not** write to disk/server. *Save* is the explicit gated flow above. Nothing about annotations auto-persists.

## Design

### 1. `AnnotationsField` — one reusable inspector component

New component `packages/workflow-react/src/inspector/AnnotationsField.tsx`, rendered identically at all three levels.

**Props**
```
value: Annotations | undefined     // the node's current annotations
disabled: boolean                  // read-only mode
modelKey: string                   // unique per node → Monaco model URI
onCommit: (next: Annotations) => void   // → setAnnotations patch
onRemove: () => void                    // → setAnnotations(undefined) patch
```

**Editing model — mirror the criterion editor (`CriterionJsonEditor`), the established inspector JSON-edit pattern, adapted for an inline pane.** A JSON-valued field cannot dispatch a patch on every keystroke (intermediate text is invalid JSON), so — exactly like criterion — the pane holds a text **buffer** and commits via an explicit **Apply**. Apply dispatches an ordinary `setAnnotations` patch. That is the whole integration with the edit model: Apply is just the UI batching for "produce one valid patch," identical to how a criterion edit commits.

**Behavior**
- **Absent** (`value === undefined`) → a single **"Add annotations"** button. Clicking it dispatches `setAnnotations({})` **immediately** — a *structural add* ("create the annotations field"), like adding a state or processor: the node now has `annotations`, undoable with Ctrl+Z, and the pane opens seeded with `{}`. Nothing is persisted until the standard Save. *(Trade-off, decided: the criterion editor instead commits only on Apply, so an unused `{}` can persist if a user clicks Add → types nothing → Saves. Accepted per the immediate-visibility decision; mitigated by Remove, and the `{}` is visible in the field and appears in the Save diff. See Known limitations.)*
- **Present** → a labeled "Annotations" section:
  - A syntax-highlighted, scrollable, **fixed-height (~220 px)** JSON pane (Monaco when the inspector Monaco runtime is available, `<textarea>` fallback otherwise — the same runtime-or-textarea split `CriterionJsonEditor` uses).
  - **Apply** — enabled only when the buffer is **valid** *and* **dirty** (parsed value not deep-equal to `value`; see Inline lifecycle).
  - **Revert** — discards buffer edits back to `value`.
  - **Remove** — dispatches `setAnnotations(undefined)`, clearing the field.
  - An inline one-line error when the buffer is invalid.
- **Read-only** (`disabled`) → the pane renders read-only; no Apply/Revert/Remove. (This is the "or just look at it" case.)

**Validation** (new helper `annotationsJson.ts`, mirroring `criterionJson.ts`): parse buffer → valid JSON → **JSON object** (reject arrays/primitives/null) → size ≤ `ANNOTATIONS_MAX_BYTES`, measured **identically to the backstop** as `new TextEncoder().encode(JSON.stringify(annotations)).length` (compacted UTF-8 bytes — *not* `String.length`, which undercounts multibyte and would let the local gate disagree with the save-time gate). On failure Apply is disabled and the error shows under the pane. (The `annotations-too-large` semantic error remains the save-time backstop; this is earlier local feedback.)

**Inline lifecycle — the buffer must track the document (review finding).** Unlike `CriterionJsonEditor`, which is mounted in a **modal** and pins its text on mount (safe because the modal remounts each open), this pane is **persistent and inline**, so it must stay in sync with the document. **All comparisons are on the parsed value (deep-equality), never on buffer text** — pretty-printing/whitespace must not read as a change.

- On mount / node switch (the forms are keyed by selection, so the field remounts per node) → seed the buffer from `value`.
- *dirty* ≝ `parse(buffer)` is valid and **not deep-equal** to `value`. The **Apply gate is exactly "dirty and valid".**
- When `value` changes, apply a **three-way rule** (this is the crux — specify it before coding):
  1. **In-sync / echo** — `value` deep-equals `parse(buffer)` (e.g. the document update produced by the field's *own* Apply): **no-op.** Do **not** call `model.setValue` — that would reformat the pane and jump the cursor on every Apply.
  2. **External change, buffer clean** — `value` differs from `parse(buffer)` and the buffer isn't dirty: **re-seed** the pane to the new `value` (reflects undo/redo and whole-config JSON edits).
  3. **External change, buffer dirty** — `value` differs *and* the buffer has unapplied edits: **keep the buffer**, show a small "document changed — Revert to reload" note; never silently clobber unapplied edits.

Without the echo no-op (rule 1), an ordinary Apply — which round-trips through the document and back into `value` — would either flash a false "document changed" note or reformat-and-jump the pane. Without rules 2–3, undo/redo and whole-config edits would desync it — the failures the modal pattern sidesteps by remounting.

Focus interplay (verified, in our favour): the global key handler treats the Monaco pane / `<textarea>` as a typing target and bails (`WorkflowEditor.tsx:128-140,623`), so document-level undo/redo and Ctrl+S don't fire while the pane is focused (Monaco handles Ctrl+Z as buffer-local undo). External re-seeds therefore almost always arrive while the pane is unfocused; the echo no-op is the focus-independent case that still needs the guard.

**Shared JSON pane.** `CriterionJsonEditor` bakes in criterion specifics (`registerCriterionSchema`, `parseCriterionJson`, `criterionModelUri`). Extract the runtime-or-textarea shell into a small primitive (e.g. `JsonMonacoField`) parameterized by `{ initialText, disabled, modelKey, modelUri, onChange, registerSchema? }` **plus a controlled re-seed input** (a `seed` value/revision the inline case uses to push external changes into the model; criterion, being modal, ignores it). Annotations pass **no schema** (object-only is enforced by the Apply gate, not Monaco) and a **distinct model-URI namespace** `cyoda://annotations/<target>.json` so it can never collide with the criterion editor's `cyoda://criterion/...` model on the same transition. Bounded refactor of working code, covered by the existing criterion tests.

### 2. Placement

- **State** → `StateForm.tsx`, **above** the destructive "Delete state…" button (not literally last).
- **Transition** → `TransitionForm.tsx`, in its own section **below Processors**.
- **Workflow** → `WorkflowForm.tsx`, at the bottom.

Each form owns the glue: render `<AnnotationsField value={node.annotations} … />` and translate `onCommit`/`onRemove` into a `setAnnotations` dispatch for that node.

### 3. Workflow-metadata discoverability — a control-cluster button

`WorkflowForm` (version / description / active) already exists but is only reachable by clicking empty canvas (`Canvas.tsx:1825` maps a pane-click to selecting `{ kind: "workflow" }`). Add a **new `CtrlBtn`** to the bottom-left control cluster (`Canvas.tsx:1757–1815`, beside Fit view / Auto-arrange / Help):

```
<CtrlBtn
  onClick={() => onSelectionChange(activeWorkflow ? { kind: "workflow", workflow: activeWorkflow } : null)}
  title="Workflow settings"
  testId="canvas-workflow-settings"
>
  <WorkflowSettingsIcon />
</CtrlBtn>
```

Both `activeWorkflow` and `onSelectionChange` are already in scope there; selecting the workflow makes the inspector render `WorkflowForm` (`resolve.ts:76` → `Inspector.tsx:147`), now carrying the annotations field. No popup, no duplicated fields — just a discoverable trigger for the form that already exists. Add a small inline-SVG `WorkflowSettingsIcon` matching the other control icons.

### 4. `setAnnotations` patch (`@cyoda/workflow-core`)

Annotations edits are ordinary granular, undoable edits — so add a targeted patch op rather than routing through `replaceSession`.

**Type** (`types/patch.ts`):
```
| { op: "setAnnotations"; target: AnnotationsTarget; annotations?: Annotations }

type AnnotationsTarget =
  | { kind: "workflow"; workflow: string }
  | { kind: "state"; workflow: string; stateCode: StateCode }
  | { kind: "transition"; transitionUuid: string }
```
`annotations === undefined` removes the field; an object sets/replaces it. Target addressing matches existing ops (`updateWorkflowMeta`, `addState`, `updateTransition` via `locateTransition`).

**Apply** (`patch/apply.ts`): locate the target and, under immer, set or `delete` its `annotations` (mirrors `setWorkflowCriterion`'s set-or-delete at `apply.ts:62-67`).

**Invert** (`patch/invert.ts`): exact inverse — a `setAnnotations` carrying the target's prior `annotations` (or `undefined`). `computeExactInverse` (`state/store.ts`) needs no special-casing since the target is stable across apply.

**Compiler coverage (implementer note).** Two `DomainPatch` switches are exhaustive with no `default`, so they *will* fail to compile until the `setAnnotations` case is added: `invertPatch` (`patch/invert.ts`) and `summarize()` (`state/store.ts`, needs a human-readable label). **But `applyPatch`'s switch (`patch/apply.ts`) has no `default`** — a missing `setAnnotations` apply case is a **silent no-op, not a compile error**. Add the apply case deliberately; don't rely on the compiler there.

**Export** `ANNOTATIONS_MAX_BYTES` from the package root (`src/index.ts`) — it exists in `validate/semantic.ts` but is not re-exported — so the React field shares the exact cap.

Additive → a `@cyoda/workflow-core` **minor**; the React work is a `@cyoda/workflow-react` **minor**.

### 5. Save integration — nothing special

This is the point of the whole design: annotations ride the existing flow with **zero** annotation-specific persistence logic.
- Every Apply / Add / Remove is a `setAnnotations` patch → new in-memory document → **undoable/redoable**.
- Changes appear in the **Save confirmation diff** (`diff.ts` compares whole workflows, so an annotations change surfaces as a "changed" workflow) and are pushed only on **explicit, confirmed Save**.
- A committed annotation over 64 KB raises the existing `annotations-too-large` semantic error → counts toward `errorCount` → **disables Save** like any other error. A transient *invalid buffer* is never committed, so it never enters the document and never affects Save gating.
- Optimistic concurrency (409 → conflict banner) applies unchanged.

## Data flow

`AnnotationsField` (buffer + validate) → `onCommit/onRemove` → `setAnnotations` patch → `applyPatch` (immer, targeted) → new document → the field **re-seeds from the updated `value`** (keeping the pane in sync). Undo/redo and whole-config JSON edits change the document and therefore re-seed the pane the same way. Persistence only via the standard Save.

## What it delivers (honest)

- **Scoped** — edit one node's annotations, not the whole file. ✅ strong.
- **Real, undoable edit** in the standard model. ✅ strong.
- **In place** — in the node's inspector, where you already are. ✅ strong.
- **Guided** — validity/shape/size feedback. ⚠️ shape + size only; annotations are opaque, so no content help is possible.
- **Discoverable** — you can *see and edit* a node's annotations once you select it. ⚠️ **on inspection, not at a glance**: with graph badges out of scope, you cannot tell *which* nodes carry annotations without selecting each. Logged as known debt (a cheap dot on the node summary/breadcrumb later — no graph work).

## Out of scope

- Graph badges / any visual indicator of annotation presence on nodes.
- Structured or schema-driven forms for annotation *contents* (opaque).
- Visual-driving.
- Annotations on processors or criteria (not in the wire contract).
- A modal/popup for workflow metadata (we reuse the existing inspector form).
- Any annotation-specific save/persistence path.

## Known limitations / accepted trade-offs

- **Unapplied buffer is lost on node switch.** Switching selection remounts the form, discarding a typed-but-not-Applied buffer — same behavior as the criterion modal's cancel. Mitigated by the visible dirty/"unapplied changes" state on the field. A navigate-away confirmation is a possible later addition, not v1.
- **At-a-glance discoverability gap** (above) — known debt.
- **Empty `{}` is legitimate.** Add commits `{}`; if the user then Saves without typing, `annotations: {}` persists — a reviewed, explicit choice (it appears in the Save diff; Remove clears it). We do not silently strip empty `{}` (fidelity, consistent with the core round-trip).
- **Workflow-level annotation errors show only in the global drawer.** `WorkflowForm` is rendered without an `issues` prop (`Inspector.tsx:147-149`), unlike `StateForm`/`TransitionForm`, so a workflow-level `annotations-too-large` won't render inline in the form. In practice the field's Apply gate blocks committing > 64 KB in-place (that error is only reachable via the whole-config JSON path), so this is minor. Optional: thread `selectionIssues` into `WorkflowForm` for parity.

## Testing

**`@cyoda/workflow-core`**
- `setAnnotations` apply: set / replace / remove at each of the three target kinds; untouched siblings preserved.
- `setAnnotations` invert: round-trips (apply → invert restores prior state) for set-over-absent, replace, and remove.

**`@cyoda/workflow-react`** (testing-library; Monaco path falls back to textarea in jsdom)
- `AnnotationsField`: "Add annotations" dispatches `setAnnotations({})` and opens the pane; Apply (valid + changed) dispatches the object; Apply disabled when unchanged or invalid (bad JSON, array/primitive, > 64 KB) with the error shown; Revert restores; Remove dispatches `setAnnotations(undefined)`.
- **Inline sync (three-way rule):** an external `value` change (simulating undo/redo) re-seeds a *clean* buffer; a *dirty* buffer is kept (with the "document changed" note); and a `value` change that deep-equals the current buffer (the Apply echo) is a **no-op** — the pane is not reformatted and the buffer is not reset. Assert the gate uses parsed-value deep-equality (a pretty-print/whitespace-only difference does not enable Apply).
- Each form (`StateForm`, `TransitionForm`, `WorkflowForm`) renders the field and dispatches `setAnnotations`; State field renders above Delete.
- Control cluster: the "Workflow settings" button calls `onSelectionChange` with `{ kind: "workflow" }`.

## Scope / release

`@cyoda/workflow-core` **minor** (`setAnnotations` + `ANNOTATIONS_MAX_BYTES` export) and `@cyoda/workflow-react` **minor** (the field, three integrations, control button). Separate PR, built on the annotations model (PR #43). The dev console picks it up on upgrade.
