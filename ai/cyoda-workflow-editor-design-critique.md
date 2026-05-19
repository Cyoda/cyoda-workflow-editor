# Design Critique — Cyoda Workflow Editor (`/criteria`)

Reviewed: `http://localhost:5173/criteria` — "Criterion editor — full coverage demo"
Target users: SMEs, BAs, and developers inside financial-services institutions.
Reviewer perspective: a senior product designer who has shipped low-code editors into bank back-office tooling.

---

## Overall Impression

The editor is **functionally rich and the underlying mental model is sound**: states as colour-coded cards, transitions as labelled edges, criteria as inspectable expressions on those edges. It reads as the work of a team that understands the domain.

The two biggest opportunities are (1) **stripping away the test-harness chrome** that currently dominates the page, and (2) **giving the canvas the room it needs** so state names and transition labels stop getting clipped. The editor is closer to a developer's debugging surface than to a financial-services admin tool today — that gap is what will make or break adoption with SMEs and BAs.

---

## What Works Well

- **Clear graph mental model.** Source → transition → target reads naturally; criteria attached to transitions match how a BA would describe a workflow rule.
- **Colour-coded state typology.** Initial (mint), normal (teal), processing (blue), manual review (purple), terminal (red) is a fast visual scan once learned.
- **Breadcrumb in the criterion modal** (`CONFIRMATION_PENDING → MATCH_MISMATCH → REPAIR_REQUESTED`) is excellent — it anchors the user in the exact place they are editing.
- **AND / OR pivot in the group editor** is the right control surface for a non-coder: a toggle, not a dropdown.
- **Per-condition Valid badges** in the criterion modal give immediate confidence that what's been entered is well-formed.
- **JSONPath autocomplete** wired to the entity sample (e.g., `$.clearing.status` appearing as `(string)`) is a genuinely powerful, BA-friendly affordance — this should be highlighted to users, not hidden.
- **Graph / JSON toggle** above the canvas, and Properties / JSON tabs on the inspector, give developers an escape hatch without forcing it on everyone else.
- **Per-criterion type metadata** (`simple`, `group`, `function`, `lifecycle`, `array`) is exposed as small chips — discreet but informative.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| The page is wrapped in a 9-tab test-harness top bar (Overview, Viewer playground, Layout showcase, Editor showcase, Criteria editor, Monaco playground, Save-flow harness, Developer utilities, Embed viewer). For a real admin user, none of those tabs exist. | Critical | Confirm that none of this chrome ships into the CYODA admin. If the embed surface is the real product, design and review against the embed view, not the harness. |
| Validation badges (0 errors / 2 warnings / 3 infos) are not interactive. Hovering and clicking do nothing. A user cannot navigate to the warning. | Critical | Make each badge open a drawer listing the issues with "jump to" links onto the offending state/transition. Errors should also visually mark the node/edge on the canvas. |
| State names are clipped at the canvas's left edge when zoomed in (`REPAIR_REQUESTED` → `EPAIR_REQUESTED`, `CANCEL_TRADE` → `EL_TRADE`, `BECOMES_PUBLISHED` → `BECO…`). The canvas pans but doesn't reveal the full label until you scroll. | High | Add overflow padding to the canvas viewport, give nodes a min-width that accommodates the longest state name in the workflow, or let labels overflow outside the node card. |
| The minimap (bottom-right) overlaps the inspector panel and partially obscures the bottom rows of states when the inspector is open. | High | Move the minimap to the bottom-left next to zoom controls, or hide it automatically when the inspector is expanded. |
| The right-hand inspector instruction ("Select a state or transition to edit it. Drag states to arrange the workflow.") disappears the moment you click anything. New users lose the only piece of onboarding the page offers. | Moderate | Promote this to a one-time dismissible coach mark, or always show a thin help affordance ("?", "What's an inspector?") in the panel header. |
| "Auto Layout" vs. "Reset Layout" buttons sit side-by-side with no visible distinction; for a BA they read as synonyms. | Moderate | Rename: "Auto-arrange" (re-runs the layout algorithm) and "Reset positions" (discards manual drags). Group them under a single "Layout" menu if you want fewer top-level buttons. |
| Properties / JSON tabs on the inspector force every user past a JSON tab they don't need. SMEs and BAs do not edit JSON. | Moderate | Default to Properties only. Move the JSON tab behind a "Developer view" toggle in a settings menu, or only show it when the user has a developer role/feature flag. |
| In the nested group editor, the label `NOT (legacy — not implemented)` appears in the user-facing UI. This is developer comm leaking through. | Moderate | Either hide legacy paths from the editor entirely, or surface a friendlier message ("This rule uses a deprecated NOT shape. Convert to the new group form?") with a one-click fix. |
| Long state names truncate to ellipsis inside transition labels (`JUST_ARRIVED_FROM_CLEAR…`, `ALL_RATE_FIXINGS_OBSERV…`) with no visible affordance to reveal the full name. | Moderate | Add a `title` tooltip on truncation, expose the full name in the inspector when hovered, or auto-wrap long labels to two lines. |
| "+ State" opens a modal pre-filled with `state1`. There is no auto-numbering, no guidance on naming convention, and no validation that prevents collisions with existing states. | Moderate | Suggest a name based on the existing convention (UPPER_SNAKE_CASE) and validate uniqueness inline before the Add button enables. |
| Issue counts (2 warnings, 3 infos) are never explained in the surrounding copy. A first-time user has no idea what counts as a warning vs. an info. | Moderate | Define the three severity levels in product help, and show severity icons on the canvas itself (yellow dot on the offending edge, etc.). |
| The "+ Note" sticky-note appears overlapping the nearest state with no obvious docking, snap, or ownership. It can be moved but its purpose for a financial-services BA is unclear. | Minor | Either remove from the default toolbar (keep it under a "more" menu) or attach notes explicitly to a state/transition so they travel with the object. |
| "Move up / Move down" inside the inspector for transitions — the impact on workflow behaviour isn't visible. Does it change evaluation order? Output JSON ordering only? | Minor | Add a one-line helper: "Order in which Cyoda evaluates outgoing transitions". |
| The bottom of the page exposes the entire `Exported Cyoda workflow JSON` as a giant dark code block. Useful for QA, scary for an SME. | Minor | Collapse by default behind "Show exported JSON" or move it behind the Developer toggle suggested above. |

---

## Visual Hierarchy

- **What draws the eye first**: the very large 48px page H1 "Criterion editor — full coverage demo" — which for a real admin user is irrelevant copy. In production the workflow name and entity should be the dominant header (e.g. "TradeCriteriaDemoWorkflow · StructuredTrade v17"), with the editor canvas immediately below.
- **Reading flow**: top description → fixture selector → stats tiles → coverage matrix → editor toolbar → canvas → inspector → exported JSON. That's a long preamble before the user reaches the thing they came to do. In the production view the canvas should be the first significant element, with the metadata reduced to a compact summary strip.
- **Emphasis**: the right elements have weight (Save is the only black solid button in the toolbar, state cards are the visual anchors of the canvas). Good.
- **Stats tiles** (Fixture / Workflows / States / Transitions / Issues) are too uniform — Issues is the only one a user can act on, and it visually has no more weight than "Hint provider". Give Issues a coloured background tied to severity and make it the actionable card.
- **The 48px H1 is significantly larger than anything else on the page.** It dominates without earning the space; the canvas, which is the work surface, is given less prominence than the title.

---

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Pill buttons in top nav vs. square-ish buttons in editor toolbar | Two different button shape languages on the same page | Pick one button family (rounded rectangle, ~6–8px radius) and use it everywhere. Reserve the high-contrast pill for the "selected" tab only. |
| State-type label position | "STATE", "INITIAL", "TERMINAL", "MANUAL REVIEW", "PROCESSING STATE" all sit *above* the name, but the styling reads as if it were part of the name (same font family, same colour family) | Either move the type into a small chip in a corner of the node card, or differentiate it strongly (smaller, all-caps, muted colour) so users don't read `STATE REPAIR_REQUESTED` as one string. |
| Naming: "Criterion" badge on edges vs. "group" / "simple" badges in the inspector | Three different vocabularies for the same concept (the edge says "Criterion", the inspector says "simple", the JSON says `type: simple`) | Unify on a single noun. "Rule" or "Condition" is more BA-friendly than "Criterion". |
| Destructive language: "Delete state…" on the state inspector vs. plain "Delete" on transitions | Inconsistent — both should follow the same pattern | Use "Delete state" and "Delete transition", both opening a confirmation. Drop the ellipsis on one and keep it on the other consistently. |
| "Source state (move)" label has parenthetical instruction; other dropdowns don't | Inconsistent labelling style | Either give every field a help affordance (`ⓘ`) or move the explanation into a tooltip. |
| The Issues badges use red / yellow / blue pills but other badges (`Criterion`, `AND · 3`, `Manual`, `Initial`) are neutral grey | Inconsistent badge taxonomy | Define a badge system: severity (red/yellow/blue), state type (coloured to match the node), neutral metadata (grey). Make sure each badge maps to exactly one category. |

---

## Accessibility

A direct DOM check on the page surfaced:

- **7 of 8 form inputs have no associated `<label>`** (only one form control has a proper label binding). Inputs use visible labels above them, but they aren't programmatically associated, which breaks screen readers and reduces click-target area (clicking the label doesn't focus the input).
  - **Fix**: wrap each label/input pair in a `<label>`, or use `htmlFor`/`id` pairs.
- **Colour contrast** of body text (`rgb(17, 33, 54)` on `rgb(255, 255, 255)`) passes WCAG AA comfortably. The teal state borders on white background may not — verify the node border colours hit 3:1 (non-text UI contrast).
- **Colour-only signal for state typology.** Green/red/blue/purple is the *only* way today to know "this is a terminal" vs. "this is a manual review". For colour-blind users this is invisible. The redundant "TERMINAL"/"MANUAL REVIEW" line helps but is the same colour family as the rest of the node — consider an icon (flag, hand, gear, stop) per state type.
- **Touch targets**: zoom +/-/fit buttons at the bottom-left are roughly 28×22 px — below the 44×44 WCAG/Apple HIG recommendation. For desktop-only it's acceptable, but if this ever ships in a tablet-friendly admin, those need to grow.
- **Keyboard navigation**: the canvas's drag-to-arrange behaviour appears mouse-only. Verify that a keyboard-only user can select a node (Tab), move it (arrow keys), and open the inspector (Enter). If not, document this as a known gap and consider a "Reorder via keyboard" mode.
- **Issue badges are not announced.** "0 errors, 2 warnings, 3 infos" reads as a single string with no semantic role; a screen reader has no idea this is a status region. Wrap in `role="status"` with an `aria-live="polite"` region.

---

## What This Means for Your Target User

A financial-services BA or SME who is trying to understand a trade-settlement workflow at a glance, today, will:

1. Land on a page that announces itself as a "full coverage demo" — they'll second-guess whether this is the real tool.
2. Scroll past four sections (description, fixture, stats, coverage matrix) before reaching the canvas.
3. See state names with `UPPER_SNAKE_CASE` and feel they've landed in a developer artefact.
4. Hit the canvas, recognise the flow visually, click a transition, and immediately get a well-built inspector — this is where the product *does* earn their trust.
5. Open the criterion editor, see a clean preview/JSON path/operation/value form, and walk away convinced the editor is usable — *if they got that far*.

The functionality is competitive with workflow tools in this space. The wrapper, the chrome, and the developer leakage are what stand between this and a polished, financial-services-grade admin.

A developer will be more comfortable, but will still want to-fix items: the JSON export panel is welcome, the inspector JSON tab is welcome, but error severity is still opaque and the test-harness vocabulary doesn't belong in their tool either.

---

## Priority Recommendations (Top 8)

1. **Design and review the production embed view, not the harness.** Decouple the test-harness shell (9 tabs, fixture selector, coverage matrix, exported JSON) from the editor proper. Until that's done, the team is critiquing the wrong artefact every cycle.

2. **Make the Issues badges interactive.** A clickable badge that opens a side panel listing each error/warning/info with a "Jump to" link onto the canvas is the single highest-leverage fix for SME confidence.

3. **Fix the canvas clipping.** State names being truncated at the viewport edge is the most damaging visual issue — it makes the product look unfinished. Padding, min-width, or label overflow all work.

4. **Strip developer language from the user-facing surface.** "NOT (legacy — not implemented)", "fixture", "harness", "Monaco playground", "Hint provider" — none of these terms should reach an SME's eyes. Audit every visible string against the BA/SME vocabulary.

5. **Pair every form control with a real `<label>`.** Trivial to do, removes a baseline a11y failing, and is table stakes for any compliance review inside a bank.

6. **Default the inspector to a single Properties view.** Hide JSON behind a "Developer view" preference. The JSON tab is currently teaching SMEs that this tool is "really" for developers.

7. **Unify the badge and button systems.** One shape family, one colour-to-meaning mapping. Right now the editor reads as four different design systems stacked on top of each other (top-nav pills, toolbar buttons, inspector buttons, criterion-editor chips).

8. **Give state-type a non-colour signal.** Icons or a typographic treatment per category. Solves colour-blind a11y *and* helps SMEs learn the typology faster.

---

## Smaller Polish Items (Worth Logging)

- Reduce H1 from 48px to ~28–32px; reclaim space for the canvas.
- "Source state (move)" — drop the parenthetical, replace with a helper tooltip.
- Add a confirmation dialog on `Delete state…` (the ellipsis suggests one already exists; verify it does, and make sure it's modal).
- Consider a per-state count of incoming / outgoing transitions on the node card itself, not just in the inspector ("2 outgoing · 0 incoming"). Helps users spot orphans visually.
- The "+ Note" sticky's pencil/X icons are unlabelled. Add `aria-label`.
- "All of 3 conditions" reads more clearly than "AND · 3" on the transition badge. Either align the canvas badge with the inspector phrasing, or let users hover to swap representations.
- Add a "Validate now" button next to Save so users can re-run validation on demand without saving.
- Save button has no obvious state (disabled/enabled, dirty/clean). After any edit, indicate that there are unsaved changes.

---

## Open Questions for the Team

- **What is the production navigation outside the editor?** This critique assumes the editor will be embedded inside the wider CYODA admin. The harness's top tabs are not representative.
- **What's the role model?** If the platform distinguishes between "developer" and "BA/SME" roles, several of the recommendations above (JSON tab visibility, JSON export panel, advanced criterion features) become role-gated rather than removed entirely.
- **How are transitions ordered in production?** The Move up / Move down behaviour needs a stated semantics before it can be made obvious in the UI.
- **Is the "Note" feature shipped, or is it a developer affordance for the harness?** Behaviour differs meaningfully depending on the answer.
- **Is there a design system in place** (tokens, components) that this editor should be conforming to? Several of the consistency findings would resolve themselves if the editor consumed a shared library.

---

*Reviewed via Playwright/Chrome instrumentation against the live `/criteria` page; screenshots and DOM inspection on file.*
