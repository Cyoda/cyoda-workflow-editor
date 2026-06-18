# Workflow Version UI — Feature Specification

**Status:** Draft  
**Date:** 2026-06-18  
**Builds on:** `ai/versioning-strategy-proposal.md` (Patrick Stanton)

---

## Context

Patrick's work in `workflow-versions` branch delivered the technical foundation:

- ✅ `workflow-core` v0.8 dialect — two-dialect system (`cyoda-0_7`, `cyoda-0_8`)
- ✅ Auto-detection and parsing of any supported version on import
- ✅ `SUPPORTED_CYODA_VERSIONS = ["0.7", "0.8"]`
- ✅ `transitions[].schedule` field on the canonical model
- ✅ Drop of `ScheduledProcessor` type (externalized-only now)
- ✅ `ParseResult.warnings` for lossy transformations

**What is missing** is the UX layer inside the editor: the user has no way to see which version they are working with, switch between versions, or choose a version when saving.

---

## Feature Description

### 1. Version indicator

When a workflow is loaded, the editor shows its dialect version clearly in the UI — for example as a chip or badge in the toolbar area: `v0.7` or `v0.8`.

The version is derived from the document's session at load time and stored in editor state. It is always visible so the user understands the context they are working in.

### 2. Version switching

The user can click the version indicator to open a version selector (dropdown or small dialog). Switching version triggers a dialect transformation:

- **Upgrade (0.7 → 0.8)**: safe, no data loss. The document is re-serialized through the 0.8 dialect.
- **Downgrade (0.8 → 0.7)**: potentially lossy — any `transitions[].schedule` fields are dropped. Before applying, the editor shows a warning: *"Switching to v0.7 will remove schedule configuration from N transitions. This cannot be undone."*

After confirmation the new version becomes the active dialect and the editor reflects any structural changes.

### 3. Version selection on save

When the user saves, the save action uses the currently active dialect version to serialize the document. No extra dialog is needed — the version shown in the toolbar is the version that gets saved.

If the user wants to save in a different version, they switch version first (step 2), then save.

---

## User Stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| 1 | Developer | See the version of the workflow I loaded | I know if I'm working with a v0.7 or v0.8 config |
| 2 | Developer | Upgrade a v0.7 workflow to v0.8 in one click | I can adopt new features without editing JSON manually |
| 3 | Developer | Be warned before losing data on downgrade | I don't accidentally remove schedule configuration |
| 4 | Developer | Save in the version I selected | The saved file is compatible with the target cyoda-go version |

---

## Implementation Plan

### Step 1 — Track version in editor state (`workflow-core` / `workflow-react`)

The `WorkflowEditorDocument` session already holds `version` on each workflow but not a top-level dialect version. We need a way to know which dialect was used to load the document.

Options:
- **A** — Add `dialectVersion: string` to `WorkflowEditorDocument.session` (cleanest, requires a `workflow-core` change)
- **B** — Derive it from the first workflow's `version` field at load time and keep it in `WorkflowEditor` local state (no core change needed, works for single-dialect documents)

Recommendation: **Option B first** — it is additive and unblocking. We can promote to Option A later.

### Step 2 — Version indicator in toolbar (`workflow-react`)

Add a small version badge to the editor toolbar (right side, near Save button). It displays `v0.7` or `v0.8` and is clickable.

Component: `VersionBadge` — takes `version: string`, `supported: readonly string[]`, `readOnly: boolean`, `onChange: (v: string) => void`.

The badge plugs into the existing `WorkflowEditor` `toolbarEnd` slot or directly into `Toolbar`.

### Step 3 — Version switch logic (`workflow-react` + `workflow-core`)

When the user selects a different version:

1. Serialize the current document using the **current** dialect's `workflowsToWire`
2. Re-parse with `parseImportPayload` using the **target** dialect
3. Check `result.warnings` — if non-empty, show a confirmation dialog listing what will be lost
4. On confirmation, call `actions.silentReplace(result.document)` and update the active version in state

New dispatch operation is not needed — `silentReplace` already exists and handles this.

### Step 4 — Wire version to save (`workflow-react`)

The `onSave` callback currently receives `WorkflowEditorDocument`. The host (dev-console) uses this to serialize and save. We need to pass the active dialect version alongside.

Options:
- **A** — Add `dialectVersion` to the document (Step 1 Option A)
- **B** — Add a second argument `onSave(doc, dialectVersion)` to `WorkflowEditorProps`

Recommendation: **Option B** — non-breaking change to the props interface.

### Step 5 — Dev Console wiring (`cyoda-dev-console`)

Update the 5 `parseImportPayload` call sites Patrick identified to pass the project's `cyodaGoVersion`. Thread the active version from the editor back to the save call site.

---

## Out of scope (this iteration)

- First-run wizard version selection (Patrick's doc, step 3) — that is a dev-console concern
- File tree version badges — separate feature
- Scheduling runtime — the `schedule` field is a placeholder; no execution logic

---

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Should the version badge appear in the **viewer** (read-only mode)? | **Yes.** The badge must be visible in read-only mode. Ops and BA users need a clear format indicator to understand the workflow configuration context without write permissions. |
| 2 | Should the upgrade path from 0.7 → 0.8 be a one-click "Upgrade to latest" button, or is the dropdown sufficient? | **Dropdown is sufficient.** No explicit upgrade button for this iteration — keeps the UI clean while still allowing a straightforward upgrade path via the dropdown. |
| 3 | Where exactly in the toolbar should the badge live? | **Right-hand side of the workflow tabs panel**, aligned horizontally with the `+ Add workflow` button area. |
