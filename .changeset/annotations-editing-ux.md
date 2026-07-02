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
