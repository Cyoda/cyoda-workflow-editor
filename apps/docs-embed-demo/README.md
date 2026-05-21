# docs-embed-demo

Internal capability showcase and regression harness for the Cyoda workflow
editor packages. The original slim embed example still exists, but the app
now also exercises the full public package surface from the browser.

## Run

```sh
pnpm install
pnpm --filter @cyoda/docs-embed-demo dev
```

Dev server listens on [http://localhost:5173](http://localhost:5173).

## Routes

- `/` overview of the showcase and what each route demonstrates
- `/viewer` parse, validate, project, render, and edit raw workflow JSON
- `/layout` compare `WorkflowViewer` fallback layout against `layoutGraph`
- `/editor` exercise `WorkflowEditor` modes, tabs, chrome, and editing shell
- `/monaco` wire Monaco JSON editing to controller, markers, and selection sync
- `/save-flow` simulate `useSaveFlow`, `SaveConfirmModal`, and `ConflictBanner`
- `/local-file-editor` open a real local workflow JSON file, edit it in the full editor, and save back clean workflow JSON with overwrite protection
- `/utilities` expose lower-level helpers like patches, graph edits, migrations, and identity lookup
- `/embed` preserve the original minimal read-only viewer example

## Package coverage

- `@cyoda/workflow-core`
  - parsing, semantic validation, serialization, patching, inverse patches
  - migration registry, ID lookup, and canonical session state
- `@cyoda/workflow-graph`
  - graph projection and representative `applyGraphEdit` conversions
- `@cyoda/workflow-viewer`
  - slim SVG rendering, selection, and external layout injection
- `@cyoda/workflow-layout`
  - ELK presets, orientation changes, and pinned-node behavior
- `@cyoda/workflow-react`
  - `WorkflowEditor`, mode switching, chrome toggles, diff summary, and save flow building blocks
- `@cyoda/workflow-monaco`
  - schema registration, patch lifting, marker rendering, and cursor/selection bridging

## Test intent

This app is intentionally useful for both humans and automation:

- focused pages make it easy to visually inspect one package surface at a time
- fixtures include valid, warning-heavy, multi-workflow, and intentionally-invalid payloads
- debug panels surface canonical JSON, lift results, generated patches, and migration output
- Playwright can target the same routes for smoke and screenshot assertions

## Visual regression

```sh
pnpm --filter @cyoda/docs-embed-demo visual:update
pnpm --filter @cyoda/docs-embed-demo test:visual
```

Routes most worth capturing:

- `/embed`
- `/layout`
- `/editor`
- `/monaco`

## Local file editor

`/local-file-editor` is a demo-only developer utility for manual testing
against workflow JSON files on the local drive. It is intentionally scoped to
`apps/docs-embed-demo` and does not change any published package surface.

- The page uses the browser File System Access API when available to open a
  file handle, reload from disk, and write back to the same file.
- Every direct overwrite requires an explicit `Overwrite local file?`
  confirmation first.
- In browsers without File System Access API support, open falls back to a file
  input and save falls back to a download.
- Saved files always come from `serializeImportPayload(document)`, so editor
  layout metadata, comments, edge anchors, and viewports are excluded from the
  written JSON.
