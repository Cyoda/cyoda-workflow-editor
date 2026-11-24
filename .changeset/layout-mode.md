---
"@cyoda/workflow-react": minor
---

Add a `"layout"` `EditorMode` (#42): the workflow definition is locked as in
`"viewer"`, but nodes and transition labels can be repositioned and the layout
controls (auto-arrange, `L`, orientation, density) stay on. Position changes
persist through `onLayoutMetadataChange` without entering the undo stack.
Connecting, deleting, "Add State", undo/redo and save are off, and the
inspector opens read-only. `"viewer"` is unchanged.
