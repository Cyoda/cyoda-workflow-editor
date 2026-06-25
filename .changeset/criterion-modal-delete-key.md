---
"@cyoda/workflow-react": patch
---

Fix: deleting text in the criterion JSON editor modal no longer deletes the
whole transition.

The editor's global Backspace/Delete shortcut (canvas "delete selected
transition/state") bailed out for `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`
targets via `isTypingTarget`, but current Monaco builds expose their editable
surface through the EditContext API as a `role="textbox"` `<div>` — none of those
tags and not `contentEditable`. So a Backspace inside the open criterion modal
escaped to the document-level handler and dispatched `removeTransition`, wiping
the transition instead of editing its criterion. `isTypingTarget` now also treats
any ARIA `role="textbox"` element, and anything inside a `.monaco-editor`, as a
typing target. Reproduces only in a real browser (jsdom does not run Monaco's
EditContext input surface); guarded by a Playwright regression test.
