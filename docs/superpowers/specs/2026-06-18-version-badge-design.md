# Version Badge — Design Spec

**Date:** 2026-06-18  
**Status:** Approved  
**Builds on:** `ai/version-ui-feature.md`, `ai/versioning-strategy-proposal.md`

---

## Overview

Add a version badge to the workflow editor that shows the active dialect version (`v0.7` / `v0.8`) for the entire document. The badge is clickable in edit mode (opens a dropdown to switch version) and read-only in viewer mode.

Version is **document-level** — all workflows in a session share one dialect. This is correct by design: workflows are added to a session via "Add workflow" and must be the same dialect to be merged.

---

## UI Components

### VersionBadge

A small pill placed on the **far right of the WorkflowTabs bar**, separated from the tabs and the `+ Add workflow` button by a flex spacer.

**Edit mode:**
- Background `#EFF6FF`, text `#1D4ED8`, border `#BFDBFE`
- Shows current version label + `▾` chevron
- On click: opens `VersionDropdown`

**Read-only / viewer mode:**
- Background `#F1F5F9`, text `#64748B`, border `#E2E8F0`
- No chevron, not interactive
- Visible so Ops/BA users can see the format

### VersionDropdown

Dropdown panel that opens below the badge.

- Header: `"Dialect version — applies to all workflows"` (small uppercase label)
- Lists all `SUPPORTED_CYODA_VERSIONS` (currently `["0.7", "0.8"]`)
- Current version is highlighted + `current` chip
- Other versions are clickable

### DowngradeWarningDialog

Shown before a **lossy** version switch (e.g. `0.8 → 0.7`).

- Icon: ⚠️ amber
- Title: `"Switch to vX.Y?"`
- Lists which fields will be removed (derived from `ParseResult.warnings` after a dry-run parse)
- Note: removal is permanent for this session; re-upgrading does not restore data
- Actions: `Cancel` | `Switch to vX.Y and remove data` (red destructive button)

Upgrade (`0.7 → 0.8`) is always safe — no dialog, switches immediately.

---

## Data Flow

```
WorkflowEditor
  ├── dialectVersion: string  (local state, derived from document on load)
  │
  ├── WorkflowTabs
  │     └── VersionBadge
  │           ├── (click) → VersionDropdown
  │           └── (select version) → handleVersionChange(targetVersion)
  │
  └── handleVersionChange(targetVersion)
        1. serializeEditorDocument(doc)  →  wire JSON (current dialect)
        2. parseImportPayload(wire, { version: targetVersion })
        3. if result.warnings → show DowngradeWarningDialog
        4. on confirm → actions.silentReplace(result.document)
                      + setDialectVersion(targetVersion)
        5. onVersionChange?.(targetVersion)   ← new optional prop for host
```

---

## WorkflowEditor Props Changes

```ts
// New optional props — no breaking changes
dialectVersion?: string;          // controlled: host provides the active version
defaultDialectVersion?: string;   // uncontrolled: editor picks on load
onVersionChange?: (version: string) => void;  // host notified on switch
onSave?: (doc: WorkflowEditorDocument, version: string) => void;  // version added
```

When `dialectVersion` is not provided, the editor derives it from the document on mount: inspect `doc.session.workflows[0]?.version` and map it to the nearest supported dialect.

---

## WorkflowTabs Props Changes

```ts
// Added to existing WorkflowTabsProps
dialectVersion?: string;
supportedVersions?: readonly string[];
onVersionChange?: (version: string) => void;
```

---

## Version Detection on Load

```ts
function detectDialectVersion(doc: WorkflowEditorDocument): string {
  const v = doc.session.workflows[0]?.version;
  if (v && SUPPORTED_CYODA_VERSIONS.includes(v)) return v;
  return LATEST_CYODA_VERSION;
}
```

---

## Downgrade Detection

A version switch is lossy when `parseImportPayload(wire, { version: target }).warnings` is non-empty. The warnings array is already populated by the 0.7 dialect when it drops `schedule` fields — no extra logic needed.

---

## Decisions

| Question | Decision |
|---|---|
| One badge or per-workflow? | One — version is document-level |
| Badge placement | Far right of WorkflowTabs, after `+ Add workflow`, flex spacer between |
| Upgrade flow | Immediate, no dialog |
| Downgrade flow | Warning dialog listing data loss before applying |
| Read-only badge | Visible, grey, no dropdown |
| "Upgrade to latest" button | Not in this iteration — dropdown is sufficient |

---

## Out of Scope

- Dev Console `cyodaGoVersion` project setting (Patrick's work, separate iteration)
- File tree version badges
- Schedule field runtime execution
