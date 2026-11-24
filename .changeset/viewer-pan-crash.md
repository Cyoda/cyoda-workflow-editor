---
"@cyoda/workflow-viewer": patch
---

Fix a crash (blank screen) when dragging the graph: a mouse move's state update
read the drag-start ref lazily, so when the button was released before React
rendered the queued update — e.g. the click that ends a drag also selects a
state — it threw `dragStart.current is null` and unmounted the viewer.
