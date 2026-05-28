---
"@cyoda/workflow-react": minor
---

Criterion editor: new "+ Add AND condition" action wraps an existing non-group criterion (simple / function / lifecycle / array) in an `AND` group with a default trailing simple condition. Lets users compose multi-condition criteria from the structured form without falling back to raw JSON. The action is hidden when the current criterion is already a group (existing group behaviour unchanged) and is restricted to the outer criterion form. Original criterion is deep-cloned before being inserted into the group's conditions.
