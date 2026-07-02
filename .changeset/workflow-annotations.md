---
"@cyoda/workflow-core": minor
---

Preserve and edit cyoda-go 0.8.1 `annotations` (engine-opaque, client-owned JSON
metadata) at the workflow, state, and transition levels.

Annotations are now modelled on the canonical `Workflow`/`State`/`Transition`
(`AnnotationsSchema`, object-only, 64 KB cap), round-tripped through the `"0.8"`
dialect (parse and serialize), and editable via the Monaco JSON editor
(autocomplete/validation come from the `ImportPayloadSchema`-derived schema).
Over-cap annotations are blocked pre-save with a locatable `annotations-too-large`
error. The `"0.7"` dialect continues to omit the field. Pre-1.0 minor per the 0.x
convention.
