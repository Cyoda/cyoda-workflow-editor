You are working in the cyoda_workflow_editor repo.

Goal:
Turn the existing partial workflow editor into a practical MVP full workflow display and edit utility.

Do not redesign the architecture. Work within the existing package boundaries:
- workflow-core: canonical domain model, patches, validation, serialization, editor metadata types
- workflow-graph: projection from domain model to graph
- workflow-layout: automatic layout and pinned/manual position handling
- workflow-react: React Flow editor UI, inspector, toolbar, modals, command history
- workflow-monaco: JSON sync and schema tooling
- workflow-viewer: read-only viewer only

Important invariants:
- Cyoda workflow JSON is the canonical workflow state.
- The graph is a projection.
- Layout, comments, viewport, anchors, and editor UI state are editor metadata only.
- Do not put layout or comments into exported Cyoda workflow JSON.
- Exported Cyoda JSON must remain deterministic and clean.
- Synthetic UUIDs must not leak into exported JSON.
- All domain edits should be patch-driven.
- Undo/redo must work for user-visible edits.
- Preserve the pnpm workspace / Changesets release model.
- Do not touch release automation unless absolutely required.

Product decisions:
- Layout must not be stored in exported Cyoda workflow JSON.
- Manual layout may initially be stored in localStorage or cookies between sessions.
- Layout should later be host-controllable through props/callbacks.
- MVP must include:
    - add/edit/delete/rename states
    - drag/reposition states
    - add/edit/delete/rename transitions
    - reposition the start/source of a transition
    - reposition the end/target of a transition
    - add/edit/delete criteria
    - add/edit/delete/reorder processors
    - add/edit/delete canvas comments
    - persist layout/comments as editor metadata, not workflow JSON

Implement this in phases.

Phase 1 — Core patch and validation hardening

Inspect and update:
- packages/workflow-core/src/types/patch.ts
- packages/workflow-core/src/patch/apply.ts
- packages/workflow-core/src/patch/invert.ts
- packages/workflow-core/src/validate/semantic.ts
- packages/workflow-core/src/types/editor.ts

Required work:
1. Ensure there are safe patch operations for:
    - addState
    - renameState
    - removeState
    - addTransition
    - updateTransition
    - renameTransition if not already cleanly covered
    - removeTransition
    - moveTransitionSource
    - moveTransitionTarget
    - setCriterion
    - removeCriterion
    - addProcessor
    - updateProcessor
    - removeProcessor
    - reorderProcessor
    - setNodePosition or equivalent editor-metadata patch
    - removeNodePosition
    - resetLayout
    - addComment
    - updateComment
    - removeComment

2. Add or improve exact inverse patches.
   Avoid coarse replaceSession inverses where a specific inverse is reasonably possible.

3. Add a transaction/batch concept if necessary so one user action can create one undo step.
   Example:
    - rename state updates the state map key, initialState if needed, transition targets, and layout metadata in one undoable command.
    - add state at cursor position creates the state and its editor-metadata position in one undoable command.
    - move transition source moves it between source state transition arrays in one undoable command.

4. Fix dangerous rename behaviour:
    - state rename must not silently overwrite an existing state.
    - transition rename must not silently collide with another transition in the same source state.

5. Add semantic validation for:
    - duplicate state names on rename/add
    - duplicate transition names within source state
    - transition target missing
    - initialState missing
    - stale layout metadata references
    - stale comment references if comments can attach to nodes/edges
    - invalid comment metadata shape

6. Preserve deterministic Cyoda JSON serialization.
   Editor metadata must not appear in serializeImportPayload / exported workflow JSON.

Acceptance:
- Core tests prove add/rename/delete/move operations are safe.
- Undo/redo inverses work without replacing the whole session where practical.
- Exported workflow JSON does not contain layout or comments.
- Existing tests continue to pass.

Phase 2 — Manual layout persistence

Inspect and update:
- packages/workflow-core/src/types/editor.ts
- packages/workflow-layout/src/*
- packages/workflow-react/src/components/Canvas.tsx
- packages/workflow-react/src/components/WorkflowEditor.tsx
- packages/workflow-react/src/state/store.ts

Required work:
1. Add editor metadata for manual node positions if it is not already complete.
   Recommended shape:
    - per workflow
    - keyed by stable semantic state identity
    - stores x/y position
    - optionally stores locked/manual flag

2. Wire React Flow node dragging:
    - onNodeDragStop should persist the new state position.
    - dragging should create one undo step per completed drag, not one per mousemove.
    - dragged nodes should become pinned/manual.

3. Merge manual layout with automatic layout:
    - existing manual/pinned positions win.
    - auto-layout places only unpositioned/unpinned nodes.
    - add Reset Layout button.
    - add Auto Layout button.
    - optionally add Auto Layout Unpositioned button.

4. Persist editor metadata between sessions.
   First implementation can use localStorage.
   Use a stable key derived from workflow name/entity/model version if available.
   Do not persist inside exported workflow JSON.

5. Expose future host persistence hooks:
    - layoutMetadata
    - onLayoutMetadataChange
      or a broader:
    - editorMetadata
    - onEditorMetadataChange

Acceptance:
- Dragging a state changes its position.
- Position survives tab reload/session reload using local persistence.
- Exported workflow JSON remains clean.
- Reset Layout removes manual positions.
- Auto Layout respects manual positions unless reset.

Phase 3 — State editing UI

Inspect and update:
- packages/workflow-react/src/components/WorkflowEditor.tsx
- packages/workflow-react/src/components/Canvas.tsx
- packages/workflow-react/src/toolbar/*
- packages/workflow-react/src/inspector/Inspector.tsx
- packages/workflow-react/src/inspector/StateForm.tsx
- packages/workflow-react/src/modals/*

Required work:
1. Add a visible Add State action:
    - toolbar button
    - keyboard shortcut if straightforward
    - canvas context menu if straightforward

2. Add state creation modal or inline action:
    - default generated name must be collision-free
    - created state should be selected immediately
    - if invoked from canvas position, store initial manual position

3. Improve state inspector:
    - rename state
    - set as initial state
    - delete state
    - show outgoing transition count
    - show incoming transition count
    - show terminal/unreachable/initial status
    - show validation issues inline

4. Delete state behaviour:
    - show confirmation
    - show cascade impact:
        - outgoing transitions removed
        - incoming transitions affected or removed depending chosen semantics
    - do not allow silent broken graph.

Product preference:
- Deleting a state should not leave transitions pointing to missing states.
- Either delete incoming transitions automatically with clear confirmation, or block delete until incoming transitions are removed. Choose the simpler safe implementation and document it.

Acceptance:
- User can add, rename, delete, and set initial state without editing JSON.
- Validation prevents duplicate state names.
- Undo/redo works.
- Canvas and inspector stay in sync.

Phase 4 — Transition editing UI and endpoint repositioning

Inspect and update:
- packages/workflow-react/src/components/Canvas.tsx
- packages/workflow-react/src/components/RfTransitionEdge.tsx
- packages/workflow-react/src/components/resolveConnection.ts
- packages/workflow-react/src/modals/DragConnectModal.tsx
- packages/workflow-react/src/inspector/TransitionForm.tsx
- packages/workflow-core/src/patch/* if needed

Required work:
1. Add transition creation:
    - drag from state to state
    - modal asks for transition name
    - no anonymous transition on cancel
    - default manual/disabled values should be explicit

2. Improve transition inspector:
    - rename transition
    - edit target state
    - edit manual
    - edit disabled
    - delete transition
    - show criterion summary
    - show processor summary
    - show validation issues inline

3. Add source/start endpoint repositioning:
    - user can move a transition from one source state to another.
    - this should move the transition between source state transition arrays.
    - preserve transition properties.
    - validate duplicate transition name in new source state.

4. Add target/end endpoint repositioning:
    - user can retarget transition to another state.
    - update transition `next`.

5. Preserve support for:
    - self-transitions
    - parallel transitions
    - manual/automated styling
    - disabled styling

6. Add safe hit areas for edges and labels.
   Transition selection should be easy.

Acceptance:
- User can add, rename, delete, retarget, and re-source transitions.
- Duplicate names in the same source are blocked.
- Undo/redo works.
- Self and parallel transitions remain usable.

Phase 5 — Criteria editor

Inspect and update:
- packages/workflow-react/src/inspector/*
- packages/workflow-react/src/modals/*
- packages/workflow-core/src/types/workflow.ts
- packages/workflow-core/src/patch/*
- packages/workflow-core/src/validate/semantic.ts

Required work:
1. Add criterion section to transition inspector.
2. Support:
    - no criterion
    - add criterion
    - edit criterion
    - delete criterion

3. Structured form support for:
    - simple criterion:
        - jsonPath
        - operation
        - value
    - group criterion:
        - operator
        - nested conditions
        - add/remove/reorder condition
    - function criterion:
        - function.name
        - function.config
        - optional local quick-exit criterion
    - lifecycle criterion:
        - field
        - operation
        - value
    - array criterion:
        - jsonPath
        - operation
        - value array

4. Add raw JSON escape hatch if structured editing becomes too large.
   The raw JSON editor must validate before committing to canonical state.

5. Draft editing:
    - allow temporary invalid form state locally
    - only commit valid criterion JSON to canonical document

Acceptance:
- User can add/edit/delete all supported criterion types.
- Nested group criteria can be edited.
- Invalid criterion drafts do not corrupt canonical workflow JSON.
- Undo/redo works.
- Serialization stays deterministic.

Phase 6 — Processor editor

Inspect and update:
- packages/workflow-react/src/inspector/ProcessorForm.tsx
- packages/workflow-react/src/inspector/*
- packages/workflow-core/src/types/workflow.ts
- packages/workflow-core/src/patch/*
- packages/workflow-core/src/validate/semantic.ts

Required work:
1. Add processor section to transition inspector.
2. Support:
    - add processor
    - edit processor
    - delete processor
    - reorder processors

3. Support externalized processors:
    - name
    - executionMode
    - config.attachEntity
    - config.calculationNodesTags
    - config.responseTimeoutMs
    - config.retryPolicy
    - config.context
    - config.asyncResult
    - config.crossoverToAsyncMs

4. Support scheduled processors:
    - name
    - config.delayMs
    - config.transition
    - config.timeoutMs

5. Provide raw JSON escape hatch if needed.

Acceptance:
- User can create and edit both externalized and scheduled processors.
- Processor order is editable.
- Duplicate processor names are validated per transition.
- Undo/redo works.
- Export serialization remains deterministic.

Phase 7 — Canvas comments

Inspect and update:
- packages/workflow-core/src/types/editor.ts
- packages/workflow-core/src/types/patch.ts
- packages/workflow-core/src/patch/*
- packages/workflow-react/src/components/Canvas.tsx
- packages/workflow-react/src/components/*
- packages/workflow-react/src/inspector/*
- packages/workflow-react/src/state/store.ts

Required work:
1. Add editor-only comments metadata.
   Comments must not be exported to Cyoda workflow JSON.

Recommended comment model:
- id
- workflowName
- text
- position x/y
- optional attachedTo:
    - state
    - transition
    - free-floating
- createdAt/updatedAt optional, only if useful

2. Add UI:
    - Add Comment toolbar action
    - Add Comment canvas context-menu action if straightforward
    - Comment rendered as draggable sticky-note style annotation
    - Edit comment text
    - Delete comment
    - Optional attach comment to selected state/transition

3. Persist comments with editor metadata in localStorage.
4. Ensure comments survive page reload.
5. Clean up comments attached to deleted states/transitions, or mark them detached.

Acceptance:
- User can add/edit/delete comments.
- Comments can be repositioned.
- Comments persist locally.
- Comments do not appear in exported Cyoda workflow JSON.
- Undo/redo works.

Phase 8 — Monaco/canvas sync hardening

Inspect and update:
- packages/workflow-monaco/src/*
- packages/workflow-react/src/state/store.ts
- packages/workflow-react/src/components/WorkflowEditor.tsx
- apps/docs-embed-demo/src/pages/*

Required work:
1. If Monaco is part of the full editor mode, wire it into the same command history.
2. Canvas edits and JSON edits must update the same canonical document.
3. Invalid JSON must not corrupt canonical state.
4. Layout/comments metadata should be migrated or cleaned when JSON removes/renames states/transitions.
5. Selection sync should work:
    - canvas selection reveals JSON
    - JSON cursor selects canvas entity where possible

Acceptance:
- Visual and JSON views stay consistent.
- Invalid JSON is isolated.
- Undo/redo behaviour is coherent.
- Layout/comments survive JSON edits where possible.

Phase 9 — Accessibility, keyboard, tests, docs

Required work:
1. Keyboard shortcuts:
    - Add state
    - Delete selected
    - Edit selected
    - Auto layout
    - Reset layout
    - Save
    - Undo/redo

2. Accessibility:
    - canvas nodes selectable by keyboard if practical
    - modals focus-trapped
    - validation messages accessible
    - buttons and graph controls labelled

3. Tests:
    - core patch tests
    - validation tests
    - React Testing Library interaction tests
    - layout persistence tests
    - comment tests
    - Playwright visual tests for graph rendering/editing

4. Documentation:
    - update README full-editor section
    - document layout/comment metadata persistence
    - document exported JSON remains clean
    - document host app integration points

Acceptance:
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- relevant visual tests pass
- README reflects actual behaviour

Output requested before implementation:
Before making changes, produce a short implementation plan listing:
- files to change
- new patch types
- new editor metadata shape
- new public APIs
- test files to add/update
- any breaking-change risks


For comments and layout, I would create a single editor metadata object, something like:

type WorkflowUiMeta = {
workflows: Record<
string,
{
nodePositions?: Record<string, { x: number; y: number; pinned?: boolean }>;
comments?: Record<
string,
{
id: string;
text: string;
x: number;
y: number;
attachedTo?:
| { kind: "state"; stateCode: string }
| { kind: "transition"; sourceState: string; transitionName: string }
| { kind: "free" };
}
>;
viewport?: {
x: number;
y: number;
zoom: number;
};
}
>;
};

That keeps the Cyoda JSON clean while giving the editor enough persistence to behave like a real design tool. The repo already has a WorkflowUiMeta concept and editor metadata separation, so this is an extension of the existing architecture, not a new direction.