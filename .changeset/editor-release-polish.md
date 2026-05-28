---
"@cyoda/workflow-react": minor
---

Release-polish pass on the workflow editor:

- Add a `developerMode` prop on `WorkflowEditor` (default `false`). When false the inspector hides its raw JSON tab and the editor reads as a business-user surface. Hosts that previously relied on the JSON tab should opt in with `developerMode`.
- Make validation badges interactive. The error/warning/info pills in the toolbar are now buttons that open an issues drawer grouped by severity, with a "Jump to" action that selects the related state, transition, or processor on the canvas.
- Increase canvas fit padding so state names are not clipped at the viewport edges; transition labels expose their full name via a `title` tooltip when truncated.
- Hide the minimap automatically when the inspector is open to prevent overlap.
- Add small inline icons to state nodes per role/category so state type can be understood without relying on colour alone; the node container now exposes an `aria-label` describing the category and state code.
- Rename toolbar labels to BA/SME-friendly copy: "Auto Layout" → "Auto-arrange", "Reset Layout" → "Reset positions", "+ State" / "+ Note" routed through i18n.
- Replace developer-leak strings: deprecated NOT criterion now shows a friendly banner explaining the deprecation; transitions expose helper text "Order controls how Cyoda evaluates outgoing transitions."
- Programmatic label associations added/audited for the AddState modal.
