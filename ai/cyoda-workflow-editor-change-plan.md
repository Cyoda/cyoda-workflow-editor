# Cyoda Workflow Editor Change Plan

This is a handoff brief for a separate AI coding session working in:

```text
/Users/patrick/dev/cyoda-workflow-editor
```

The issue was discovered while embedding the editor/viewer in the developer website:

```text
/Users/patrick/cyodalight-website
```

The local source workflow used for repro is:

```text
/Users/patrick/dev/cyodalight-helloworld/config/helloworld-workflow.json
```

## Problem

The Hello World workflow render in the developer website looks materially worse than the Launchpad workflow render:

- Transition paths start and end at node centers instead of node edges.
- Arrowheads are hidden behind target nodes, so transitions appear to have no arrow.
- Transition labels overlap each other.
- The layout is visually compressed and does not match the Launchpad-style output.
- The canonical Hello World JSON does not parse without consumer-side shims for missing `disabled` and processor `type`.
- The website now needs an editable workflow artifact, but the package API currently makes the choice feel too binary: slim read-only SVG viewer or full editor shell.

The current website integration exposes package behavior that should be fixed or hardened in `cyoda-workflow-editor`, not papered over in every consuming project.

## Current Call Paths

Launchpad uses the polished path:

```tsx
import { parseImportPayload } from '@cyoda/workflow-core';
import { projectToGraph } from '@cyoda/workflow-graph';
import { layoutGraph } from '@cyoda/workflow-layout';
import { WorkflowViewer } from '@cyoda/workflow-viewer';

const parsed = parseImportPayload(asImportPayload(workflowJson));
const graph = projectToGraph(parsed.document);

layoutGraph(graph, {
  preset: 'opsAudit',
  orientation: 'vertical',
  nodeSize: { width: 204, height: 102 },
}).then(setLayout);

<WorkflowViewer
  graph={graph}
  layout={layout ?? undefined}
  selectedId={selectedId ?? undefined}
  onSelectionChange={setSelectedId}
/>
```

Relevant Launchpad file:

```text
/Users/patrick/dev/cyoda-launchpad/src/components/AgenticAiWorkflowViewer.tsx
```

The website currently uses the minimal path:

```tsx
import { parseImportPayload } from '@cyoda/workflow-core';
import { projectToGraph } from '@cyoda/workflow-graph';
import { WorkflowViewer } from '@cyoda/workflow-viewer';

const parsed = parseImportPayload(workflowJson);
const graph = projectToGraph(parsed.document);

<WorkflowViewer graph={graph} />
```

Relevant website file:

```text
/Users/patrick/cyodalight-website/src/components/HelloWorldWorkflowViewer.tsx
```

`WorkflowViewer` falls back to `simpleLayout(graph)` when no ELK layout is supplied.

Relevant package files:

```text
packages/workflow-viewer/src/components/WorkflowViewer.tsx
packages/workflow-viewer/src/components/EdgePath.tsx
packages/workflow-viewer/src/layout.ts
packages/workflow-layout/src/adapter.ts
packages/workflow-react/src/components/WorkflowEditor.tsx
packages/workflow-react/src/components/Canvas.tsx
```

## Root Causes

### 1. Fallback viewer geometry draws center-to-center edges

`packages/workflow-viewer/src/components/EdgePath.tsx` currently computes fallback paths from the center of the source node to the center of the target node:

```ts
const sx = source.x + source.width / 2;
const sy = source.y + source.height / 2;
const tx = target.x + target.width / 2;
const ty = target.y + target.height / 2;
```

Nodes are rendered after edges, so the arrowhead ends under the target node. The arrow exists in the SVG but is visually hidden.

### 2. Fallback viewer labels do not have collision avoidance

When an ELK route is present, labels use route metadata:

```tsx
const labelPos = route
  ? { midX: route.labelX, midY: route.labelY }
  : computeEdgeGeometry(edge, source, target);
```

Without ELK, labels use a simple midpoint heuristic. For the Hello World workflow, sibling transitions into `DONE` put two labels almost on top of each other.

### 3. `simpleLayout` is dependency-free but too weak for public embeds

`packages/workflow-viewer/src/layout.ts` intentionally keeps the viewer package independent of ELK. That is reasonable for bundle size, but the fallback renderer still needs minimum quality guarantees:

- Edge endpoints must attach to node edges.
- Arrowheads must be visible.
- Parallel and crossing labels must not overlap in simple branch/merge graphs.
- The fallback should not visually contradict the Cyoda workflow conventions.

### 4. Canonical import payloads need friendlier normalization

The current core schema requires:

```ts
manual: z.boolean()
disabled: z.boolean()
```

and processors require:

```ts
type: 'externalized' | 'scheduled'
```

The current Hello World workflow JSON omits `disabled` and omits processor `type`. The website had to add a local normalization shim:

```ts
transition.disabled ??= false;
processor.type ??= 'externalized';
```

That kind of compatibility should live in `@cyoda/workflow-core` parse/normalization, assuming these omissions are valid in canonical Cyoda workflow JSON.

### 5. Editable embed mode is not quite the same as a polished product artifact

`WorkflowEditor` exists in `@cyoda/workflow-react` and supports:

```ts
mode?: 'viewer' | 'playground' | 'editor'
```

However, it currently renders a full editor shell:

- toolbar
- tabs
- canvas
- inspector
- minimap and React Flow controls

For a developer homepage or docs embed, consumers may need an editable but compact artifact. The package should expose a cleaner embedded editable mode instead of requiring each site to hide editor chrome with CSS.

## Required Package Changes

### A. Improve fallback edge routing in `@cyoda/workflow-viewer`

Update `computeEdgeGeometry` or introduce a new routing helper so non-ELK fallback edges attach to node boundaries, not centers.

Recommended behavior:

- For vertical flow, default source port is bottom center and target port is top center.
- For horizontal flow, default source port is right center and target port is left center.
- For diagonal fallback edges, compute line-to-rectangle intersections so paths start and end at the nearest node border.
- Respect `sourceAnchor` and `targetAnchor` when present on `TransitionEdge`.
- Ensure marker end points are outside the target node, with enough clearance for the arrowhead.
- Keep self-loop behavior, but make sure the marker is visible and not under the node.

Suggested implementation areas:

```text
packages/workflow-viewer/src/components/EdgePath.tsx
packages/workflow-viewer/src/layout.ts
```

Suggested tests:

```text
packages/workflow-viewer/tests/viewer.test.tsx
```

Add unit tests around exported or extracted helpers:

- `START -> MORNING` path starts at source bottom edge and ends at target top edge.
- `MORNING -> DONE` and `AFTERNOON -> DONE` arrowheads remain outside the `DONE` node bounds.
- Parallel edges are offset enough that their paths and labels are distinguishable.

### B. Add fallback label collision avoidance

The ELK layout path already estimates label dimensions and places labels with collision checks in:

```text
packages/workflow-layout/src/adapter.ts
```

Implement a smaller equivalent for viewer fallback labels, or extract a shared helper if that does not introduce unwanted dependency direction.

Minimum behavior:

- Estimate label width and height using the same assumptions as `workflow-layout`.
- Avoid intersections between labels.
- Avoid placing labels over source or target nodes.
- Avoid placing labels directly over endpoint zones and arrowheads.
- For simple branch/merge layouts, place sibling labels on different vertical or horizontal offsets.

Good first target:

The Hello World workflow must render with four readable transition labels:

- `ToMorning`
- `ToAfternoon`
- `MorningToDone`
- `AfternoonToDone`

No two label pills should overlap.

### C. Make canonical JSON parsing more tolerant in `@cyoda/workflow-core`

If the Cyoda API/docs consider omitted `disabled` and omitted externalized processor `type` valid, `parseImportPayload` should normalize them.

Recommended parser behavior:

- Missing transition `disabled` defaults to `false`.
- Missing transition `manual` should be considered carefully. If the canonical API always requires it, keep required. If not, default to `false`.
- Processor objects with a `name` and no `type` default to `{ type: 'externalized', ...processor }`.
- Keep explicit scheduled processors unchanged.
- Preserve round-trip semantics where possible.

Likely files:

```text
packages/workflow-core/src/schema/workflow.ts
packages/workflow-core/src/schema/processor.ts
packages/workflow-core/src/normalize/input.ts
packages/workflow-core/tests/golden/fixtures
packages/workflow-core/tests/golden/runner.test.ts
```

Suggested tests:

- Add a fixture based on `/Users/patrick/dev/cyodalight-helloworld/config/helloworld-workflow.json`.
- Assert it parses without consumer-side mutation.
- Assert normalized transitions contain `disabled: false`.
- Assert bare processor entries are normalized to `type: 'externalized'`.

### D. Provide an explicit polished embed path

Consumers currently have to know that `WorkflowViewer` without `layout` is lower fidelity. The package should make the polished path obvious.

Options:

1. Add docs and examples that strongly recommend:

```tsx
const layout = await layoutGraph(graph, {
  preset: 'websiteCompact',
  orientation: 'vertical',
});

<WorkflowViewer graph={graph} layout={layout} />
```

2. Add a convenience component in a package that is allowed to depend on layout:

```tsx
<AutoLayoutWorkflowViewer
  graph={graph}
  preset="websiteCompact"
  orientation="vertical"
/>
```

This could live in `@cyoda/workflow-react` or a new package, not necessarily in the slim `@cyoda/workflow-viewer`.

3. Add a runtime development warning when `WorkflowViewer` renders a graph with branching/merging edges and no `layout` prop.

This warning should not fire in production builds.

### E. Add an embedded editable mode

The website requirement has changed from read-only viewer to editable example. Do not force consuming sites to embed a full admin-style editor shell if they only need a polished editable workflow artifact.

Recommended API addition:

```tsx
<WorkflowEditor
  document={document}
  mode="playground"
  variant="embed"
  layoutOptions={{
    preset: 'websiteCompact',
    orientation: 'vertical',
  }}
  chrome={{
    toolbar: 'compact',
    tabs: false,
    inspector: false,
    minimap: false,
    controls: true,
  }}
  onChange={setDocument}
/>
```

The exact API can differ, but the package should support these capabilities:

- Editable nodes and drag-connect remain available.
- Toolbar can be hidden or compact.
- Inspector can be hidden.
- Tabs can be hidden when there is only one workflow.
- Minimap can be disabled.
- React Flow controls can be enabled or disabled.
- The component remains accessible and keyboard safe.

Likely files:

```text
packages/workflow-react/src/components/WorkflowEditor.tsx
packages/workflow-react/src/components/Canvas.tsx
packages/workflow-react/src/toolbar/Toolbar.tsx
packages/workflow-react/src/toolbar/WorkflowTabs.tsx
packages/workflow-react/tests/editor.test.tsx
packages/workflow-react/tests/a11y.test.tsx
```

Suggested tests:

- `variant="embed"` renders canvas and compact controls without inspector.
- `mode="playground"` still allows drag-connect.
- `mode="viewer"` with `variant="embed"` remains read-only.
- Single-workflow embed can hide tabs.
- Minimap can be disabled.

## Acceptance Criteria

Use the Hello World workflow as the main visual regression fixture.

The package-level fix is complete when:

- The Hello World workflow parses without a consumer-side shim.
- The fallback `WorkflowViewer` path no longer hides arrowheads under nodes.
- Transition endpoints visibly attach to node edges.
- Transition labels do not overlap on the Hello World workflow.
- The Launchpad `WorkflowViewer + layoutGraph` path still renders as before.
- A documented editable embed path exists and can be used by the website.
- Existing package tests pass.
- New tests cover fallback viewer routing, label placement, core normalization, and embedded editor chrome controls.

## Suggested Verification Commands

From `/Users/patrick/dev/cyoda-workflow-editor`:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

If visual tests are configured locally:

```bash
pnpm --filter @cyoda/docs-embed-demo test:visual
```

After package changes, verify the website integration from:

```text
/Users/patrick/cyodalight-website
```

with:

```bash
npm run build
```

and inspect:

```text
http://127.0.0.1:4322/cyodalight-website/
```

## Notes For The Next AI Session

- Do not solve this only in the website by manually routing Hello World edges.
- Prefer package-level fixes so all consumers benefit.
- Keep `@cyoda/workflow-viewer` slim if bundle size is a hard constraint, but its fallback output must still be visually correct.
- If ELK must remain optional, make the no-ELK fallback safe and make the ELK path easier to discover.
- Avoid changing Launchpad-specific code unless it is only for verification.
- The website can later switch from `WorkflowViewer` to the new editable embed API once it exists.
