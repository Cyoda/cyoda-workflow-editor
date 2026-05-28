# Security Review: cyoda-workflow-editor

## Executive Summary

**Security release recommendation: Ready after fixes**

> **Update (post-review fixes applied):**
> - **HIGH-001 FIXED** — All four actions in `release.yml` pinned to full commit SHAs (see [HIGH-001] below for details).
> - **HIGH-002 FIXED** — Criteria traversal depth guards and JSON size/depth limits added to `parseImportPayload`, `normalizeCriterion`, and `walkInner`. 12 new regression tests added.
> - **LOW-001 FIXED** — Unused variables removed from `ProcessorForm.tsx`.
> - Remaining open: MEDIUM-001 (devDep audit), MEDIUM-002, MEDIUM-003, LOW-002, LOW-003.

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 2 | **Both fixed** |
| Medium | 3 | Open |
| Low | 3 | LOW-001 fixed; LOW-002, LOW-003 open |

| Command | Result |
|---|---|
| `pnpm audit` | 3 moderate findings (all devDependencies) |
| `pnpm lint` | PASS (after LOW-001 fix) |
| `pnpm typecheck` | PASS (after LOW-001 fix) |
| `pnpm test` | PASS — 215 tests (203 original + 12 new DoS-guard tests) |
| `pnpm build` | PASS |
| `node ./scripts/release-preflight.mjs` | PASS |
| `git grep dangerouslySetInnerHTML` | Clean |
| `git grep "eval("` | Clean |
| `git grep "new Function"` | Clean |
| `git grep innerHTML` | Clean |
| `git grep localStorage` | Found — legitimate bounded use in WorkflowEditor.tsx |
| `git grep document.cookie` | Clean |
| `git grep postMessage` | Clean |
| `git grep window.open` | Clean |
| `git grep 'target="_blank"'` | Clean |
| `git grep NPM_TOKEN` | Found — in GitHub Actions secrets reference only (not hardcoded) |
| `git grep GITHUB_TOKEN` | Found — in GitHub Actions secrets reference only (not hardcoded) |
| `git grep '"secret"'` | Clean |
| `git grep '"password"'` | Clean |
| `git grep apiKey` | Clean |
| `git status --short` | One untracked file: `ai/code-review-2.md` |

The main risk before public release is two-fold. First, the GitHub Actions release workflow uses mutable version tags for all third-party actions while simultaneously holding `id-token: write` (OIDC) and access to `NPM_TOKEN`; a compromised tag would give an attacker the ability to publish malicious packages to npm under the `@cyoda` scope. Second, the recursive criteria traversal functions (`normalizeCriterion`, `walkInner`, and Zod's `z.lazy()`-backed `CriterionSchema`) have no depth guard that fires before they recurse — a JSON payload with a deeply nested criterion tree (> ~8,000 levels) can overflow the JavaScript call stack in any context where `parseImportPayload` is called, including the Monaco debounce path in embedded apps.

---

## Scope

**Reviewed:**
- `packages/workflow-core` — parsing, normalization, Zod validation, semantic validation, patch, serialize
- `packages/workflow-graph` — workflow-to-graph projection
- `packages/workflow-layout` — ELK layout adapter
- `packages/workflow-viewer` — read-only SVG renderer
- `packages/workflow-react` — React Flow editor shell, inspector, toolbar, comments, localStorage persistence
- `packages/workflow-monaco` — Monaco JSON editor controller, schema registration, markers, bridge
- `apps/docs-embed-demo` — private demo harness (Vite + Playwright)
- `scripts/release-preflight.mjs`, `scripts/release-publish.mjs`
- `.github/workflows/release.yml`
- `.changeset/config.json`
- All `package.json` files (publish config, files arrays, private flags)
- `SECURITY.md`

**Not reviewed / limitations:**
- No production deployment environment was tested.
- No authenticated backend was tested.
- No penetration test was performed.
- No manual browser exploit testing was performed.
- `pnpm audit` results cover declared dependencies only; transitive runtime dep vulns in consumer bundled output were not assessed beyond the audit output.
- The Playwright visual tests in the demo app were not executed.

---

## Threat Model

| Scenario | Notes |
|---|---|
| User opens or embeds untrusted workflow JSON | Primary risk: DoS via deeply nested criteria; all string fields enter the UI via React text rendering (auto-escaped) |
| Malicious workflow/state/transition/processor/criterion names | All rendered as React JSX text children or SVG text — auto-escaped; no innerHTML or dangerouslySetInnerHTML found |
| Malicious JSON edited in Monaco | JSON is parsed via `parseImportPayload` before any patch is applied; invalid JSON leaves canonical state untouched |
| Malicious metadata in localStorage | localStorage stores only layout positions, comment text, viewports, edge anchors; not exported into workflow JSON |
| Package consumer imports public packages | Published packages contain only `dist/`, `README.md`, `LICENSE`; no demo, test, or source files |
| Demo app exposes unsafe patterns | Demo is `private: true`, excluded from changesets, not published; runs only locally |
| npm package / release workflow compromise | GitHub Actions use mutable action tags with NPM_TOKEN access — HIGH risk |
| Dependency / script supply-chain | No postinstall scripts in any package; three moderate devDep audit hits; all action tags are mutable |

---

## Critical Issues

None found.

---

## High Issues

### [HIGH-001] GitHub Actions release workflow uses mutable third-party action tags ✅ FIXED

- **Severity:** High
- **Area:** Supply chain
- **Files:**
  - `.github/workflows/release.yml`
- **Problem:**
  All four third-party GitHub Actions were pinned to mutable version tags (`@v4`, `@v1`), not immutable commit SHAs. The workflow holds `id-token: write` (OIDC) and `contents: write`, and injects `NPM_TOKEN` and `GITHUB_TOKEN` at publish time. If any of the referenced action repositories were compromised or their `v4`/`v1` tags were force-pushed to malicious commits, the release pipeline would execute attacker-controlled code with full access to both secrets.
- **Fix applied:**
  All four actions in both jobs of `release.yml` replaced with full commit SHAs verified against the upstream repositories. Inline `# vX.Y.Z` comments added for readability. `release-preflight.yml` and `ci.yml` were left unchanged — they have only `contents: read` and do not receive `NPM_TOKEN` or `id-token: write`.

  | Action | Old ref | Pinned SHA | Verified version |
  |---|---|---|---|
  | `actions/checkout` | `@v4` | `34e114876b0b11c390a56381ad16ebd13914f8d5` | v4.3.1 |
  | `pnpm/action-setup` | `@v4` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` | v4.3.0 |
  | `actions/setup-node` | `@v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
  | `changesets/action` | `@v1` | `63a615b9cd06ba9a3e6d13796c7fbcb080a60a0b` | v1.8.0 |

  SHAs were resolved via `git ls-remote` against the upstream repositories and cross-checked against their specific version tags (e.g. `refs/tags/v4.3.1` for `actions/checkout`).
- **Evidence (pre-fix):**
  ```yaml
  uses: actions/checkout@v4          # mutable
  uses: pnpm/action-setup@v4         # mutable
  uses: actions/setup-node@v4        # mutable
  uses: changesets/action@v1         # mutable
  ```
- **Remaining note:**
  `id-token: write` is still granted at the job level rather than scoped to the publish step. GitHub Actions does not support step-level permission overrides; the entire job requires the token for the Changesets `publish` step. This is documented but cannot be narrowed further.
- **Confidence:** High

---

### [HIGH-002] Recursive criteria traversal has no stack-depth guard before the iterative depth check

- **Severity:** High
- **Area:** Denial of service / JSON parsing
- **Files:**
  - `packages/workflow-core/src/normalize/input.ts` — `normalizeCriterion`
  - `packages/workflow-core/src/validate/helpers.ts` — `walkInner`
  - `packages/workflow-core/src/schema/criterion.ts` — `CriterionSchema` via `z.lazy()`
- **Problem:**
  The criterion processing pipeline contains three independently recursive code paths that are exercised before the safe iterative depth check (`criterionMaxDepth`) runs. All three will overflow the JavaScript call stack when given a criterion tree that is several thousand levels deep. The semantic validation check (`MAX_CRITERION_DEPTH = 50`) only fires after the recursive passes complete, so it provides no protection against a crafted payload.

  1. `CriterionSchema` uses `z.lazy()` for self-reference. Zod v3 evaluates `z.lazy` lazily but still recurses through the actual data during `safeParse`. A 10 000-level deep `group` criterion causes Zod to recurse 10 000 frames.
  2. `normalizeCriterion` (called from `normalizeWorkflowInput`) recurses directly for `group` and `function` types with no depth parameter.
  3. `walkInner` (called from `walkCriteria`, called from `criterionRules` inside `validateSemantics`) is a recursive generator that `yield*`-delegates into itself for every nested group node.
- **Evidence:**
  ```ts
  // packages/workflow-core/src/normalize/input.ts
  export function normalizeCriterion(criterion: Criterion): Criterion {
    ...
    case "group":
      return { ...criterion, conditions: criterion.conditions.map(normalizeCriterion) };
    // No depth parameter, no guard.
  ```
  ```ts
  // packages/workflow-core/src/validate/helpers.ts
  function* walkInner(c: Criterion, where: CriterionLocation) {
    yield { criterion: c, where };
    if (c.type === "group") {
      for (const child of c.conditions) yield* walkInner(child, where);
    }
    // Recursive generator, no depth guard.
  ```
  ```ts
  // packages/workflow-core/src/schema/criterion.ts
  export const CriterionSchema: z.ZodType<Criterion> = z.lazy(() =>
    z.union([ ..., GroupCriterionSchema, ... ])
  );
  ```
  The safe check is only iterative `criterionMaxDepth` in `criterionDepthRules`, which runs *after* `criterionRules` (which uses `walkCriteria`).
- **Exploit scenario:**
  An attacker crafts a workflow JSON with a criterion group nested 10 000 levels deep:
  ```json
  {"importMode":"MERGE","workflows":[{"name":"w","version":"1.0","initialState":"s","active":true,"states":{"s":{"transitions":[{"name":"t","next":"s","criterion":{"type":"group","operator":"AND","conditions":[{"type":"group","operator":"AND","conditions":[...10000 levels...]}}]}}]}}}]}
  ```
  A user pastes this into the Monaco editor tab. The 300 ms debounce fires, `liftJsonToPatch` → `parseImportPayload` → Zod parse → `normalizeWorkflowInput` → `normalizeCriterion` causes a stack overflow. The browser tab crashes or the Node.js SSR process terminates.
- **Impact:**
  Denial of service for any embedded consumer that allows users to provide workflow JSON. The Monaco editor path has a debounce but no rate limit or payload size limit. A single paste crashes the tab.
- **Recommended fix:**
  Add an iterative pre-pass (or a tracked depth parameter) that throws/returns early before recursion exceeds a safe bound (e.g. 200) in `normalizeCriterion` and `walkInner`. Add a maximum JSON byte length check in `parseImportPayload` before calling `JSON.parse`. Consider adding `z.string().max(N)` on the JSON string accepted by `liftJsonToPatch`.
- **Confidence:** High

---

## Medium Issues

### [MEDIUM-001] Three moderate audit vulnerabilities in devDependencies (esbuild, Vite, ws)

- **Severity:** Medium
- **Area:** Dependency
- **Files:**
  - `package.json` — root devDependencies (`vitest@1.6.1` → `vite@5.4.21` → `esbuild@0.21.5`, `ws@8.20.0`)
  - `apps/docs-embed-demo/package.json` — Vite `^6.4.2` (patched for path traversal)
- **Problem:**
  `pnpm audit` reports three moderate vulnerabilities:
  - **esbuild ≤ 0.24.2** (GHSA-67mh-4wv8-2f99): dev server CORS bypass allows any website to send requests to the esbuild dev server and read responses. Path: `vitest@1.6.1 → vite@5.4.21 → esbuild@0.21.5`.
  - **vite ≤ 6.4.1** (GHSA-4w7w-66w2-5vf9): path traversal via optimized deps `.map` handling in the dev server. Same `vitest` path pulls in `vite@5.4.21`.
  - **ws ≥ 8.0.0 < 8.20.1** (GHSA-58qx-3vcg-4xpx): uninitialized memory disclosure. Path: `vitest@1.6.1 → jsdom@24.1.3 → ws@8.20.0`.

  All three are in `devDependencies` only and are not included in the published package `files` arrays. They affect only development machines running `pnpm dev` or `pnpm test`, not consumers of the published packages.
- **Evidence:**
  ```
  3 vulnerabilities found — Severity: 3 moderate
  esbuild@0.21.5  <=0.24.2   patched >=0.25.0
  vite@5.4.21     <=6.4.1    patched >=6.4.2
  ws@8.20.0       <8.20.1    patched >=8.20.1
  ```
- **Exploit scenario:**
  A developer runs `pnpm test:watch` or `pnpm dev` (demo) on an untrusted network. A page open in another tab could exploit the esbuild or Vite CORS flaw to probe internal files served by the dev server.
- **Impact:**
  No impact on published packages or end users of the library. Developer machines could be affected when running test tooling.
- **Recommended fix:**
  Upgrade `vitest` to `^2.x` (which pulls in Vite v6 and a patched esbuild). Alternatively, use `pnpm.overrides` in the root `package.json` to force `vite >= 6.4.2` and `esbuild >= 0.25.0` and `ws >= 8.20.1` across the workspace.
- **Confidence:** High (audit-confirmed)

---

### [MEDIUM-002] `localStorageKey` prop accepts arbitrary host-supplied string with no namespace documentation

- **Severity:** Medium
- **Area:** LocalStorage
- **Files:**
  - `packages/workflow-react/src/components/WorkflowEditor.tsx:79,143`
  - `packages/workflow-react/README.md`
- **Problem:**
  The `localStorageKey` prop is passed directly to `localStorage.getItem` and `localStorage.setItem` without validation or namespacing. If a host application passes a user-controlled string (e.g. derived from a document ID in a URL) as `localStorageKey`, an attacker who can influence that string can cause key collisions with other localStorage entries in the same browser origin — either reading layout data saved for a different document or overwriting it with crafted data.

  Additionally, there is no documentation warning that the key should be origin-scoped or that user-controlled values are unsafe.
- **Evidence:**
  ```ts
  // WorkflowEditor.tsx:158
  const stored = localStorage.getItem(localStorageKey);
  // WorkflowEditor.tsx:213
  localStorage.setItem(localStorageKey, JSON.stringify(toStore));
  ```
  The README documents the prop but does not warn against passing user-controlled values.
- **Exploit scenario:**
  A host app uses `localStorageKey={`editor-${docId}`}` where `docId` comes from the URL. An attacker tricks the user into visiting a URL with a crafted `docId` that collides with a different document's key, reading or overwriting layout positions for a document the attacker does not own.
- **Impact:**
  Data integrity of saved layout metadata for other documents; no credential exposure (the stored data is layout positions and comment text only, not workflow JSON or secrets).
- **Recommended fix:**
  Add a documentation note explicitly stating that `localStorageKey` must not be derived from user-controlled input without sanitization. Optionally add a runtime validation that rejects strings containing characters typically used in injection patterns, or scope the default key to include a stable app-specific prefix.
- **Confidence:** Medium

---

### [MEDIUM-003] Comment text stored in localStorage without enforced size limit

- **Severity:** Medium
- **Area:** LocalStorage
- **Files:**
  - `packages/workflow-react/src/components/CommentNode.tsx`
  - `packages/workflow-react/src/components/WorkflowEditor.tsx:202-220`
- **Problem:**
  The `CommentNode` component uses a `<textarea>` with no `maxLength` attribute. The full `text` value is serialized into localStorage via `JSON.stringify(toStore)` on every change. A user can type arbitrarily long text in a comment; there is no cap on either the textarea input or the stored payload. The `catch {}` block silently swallows `QuotaExceededError`, so storage exhaustion fails silently and subsequent writes (including layout positions) are also silently discarded.
- **Evidence:**
  ```tsx
  // CommentNode.tsx — no maxLength on the textarea
  <textarea
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    rows={3}
    ...
  />
  ```
  ```ts
  // WorkflowEditor.tsx:217-218
  } catch {
    // Ignore storage quota or SSR errors.
  }
  ```
- **Exploit scenario:**
  A malicious workflow JSON document (shared between colleagues via a file) contains pre-seeded comment metadata with a very large `text` field. On opening, the comment is imported into `workflowUi` and written to localStorage, exhausting the origin's 5 MB localStorage quota. Subsequent legitimate writes by any other app on the same origin silently fail.
- **Impact:**
  Denial of localStorage for the entire browser origin for the affected user. No credential exposure.
- **Recommended fix:**
  Add `maxLength` to the `<textarea>` (e.g. 2000 characters). Validate and truncate `text` values read from imported metadata before writing them to `workflowUi`. Consider surfacing a warning to the user when `QuotaExceededError` is caught rather than silently discarding.
- **Confidence:** Medium

---

## Low Issues / Hardening

### [LOW-001] Lint and typecheck failures on current branch

- **Severity:** Low
- **Area:** Code quality gate / release readiness
- **Files:**
  - `packages/workflow-react/src/inspector/ProcessorForm.tsx:701,726`
- **Problem:**
  `pnpm lint` and `pnpm typecheck` both fail with two unused-variable errors (`textAreaStyle`, `helperTextStyle`). The GitHub Actions release workflow runs `pnpm typecheck && pnpm build && pnpm test` as a validation gate, so a push to `main` from this branch would fail CI before reaching the publish step. This is not a direct security vulnerability but indicates a broken quality gate on the current branch.
- **Evidence:**
  ```
  packages/workflow-react/src/inspector/ProcessorForm.tsx(701,7): error TS6133: 'textAreaStyle' is declared but its value is never read.
  packages/workflow-react/src/inspector/ProcessorForm.tsx(726,7): error TS6133: 'helperTextStyle' is declared but its value is never read.
  ```
- **Exploit scenario:**
  Not exploitable. However, if typecheck is bypassed or the CI gate is loosened to merge broken code, dead variables increase review noise and make future security-relevant changes harder to audit.
- **Recommended fix:**
  Remove the two unused variables before merging to `main`.
- **Confidence:** High

---

### [LOW-002] Untracked file `ai/code-review-2.md` in working tree

- **Severity:** Low
- **Area:** Information disclosure
- **Files:**
  - `ai/code-review-2.md` (untracked)
- **Problem:**
  `git status --short` shows `?? ai/code-review-2.md`. The file is untracked but sits in the working tree alongside the existing `ai/` directory, which contains design notes, npm release mechanism discussions, and enhancement specs. Untracked files are not published in the npm package (`files` arrays limit what `npm pack` includes), but if this file contains sensitive design decisions, internal business logic, or security analysis, its presence in the working tree of a public repository increases the risk of accidental commit.
- **Evidence:**
  ```
  ?? ai/code-review-2.md
  ```
- **Recommended fix:**
  Review the file's content. If it should not be committed, add `ai/` or `ai/code-review-2.md` to `.gitignore`. If it is safe to commit, commit it intentionally.
- **Confidence:** High

---

### [LOW-003] `process.env.NODE_ENV` in published viewer dist may be unresolved in some consumer environments

- **Severity:** Low
- **Area:** Information disclosure / runtime behaviour
- **Files:**
  - `packages/workflow-viewer/src/components/WorkflowViewer.tsx:68`
  - `packages/workflow-viewer/dist/index.js` (published)
- **Problem:**
  The published ESM and CJS bundles for `@cyoda/workflow-viewer` contain `process.env.NODE_ENV`. If a consumer's bundler does not replace this (e.g. a non-Vite/non-webpack environment, a simple Node.js ESM `import`, or a Deno/edge runtime), the condition evaluates as `if (undefined === "production" || layout)`. The `console.warn` about layout quality then fires unconditionally in production in those environments, leaking an internal implementation hint.
- **Evidence:**
  ```ts
  // packages/workflow-viewer/src/components/WorkflowViewer.tsx:68
  if (process.env.NODE_ENV === "production" || layout) return;
  console.warn("[WorkflowViewer] Rendering without an ELK layout ...");
  ```
- **Exploit scenario:**
  Not exploitable. The warn message is informational only, but reveals implementation details about the package internals in production.
- **Recommended fix:**
  Replace the runtime `process.env.NODE_ENV` check with a build-time constant in tsup config (`define: { "process.env.NODE_ENV": JSON.stringify("production") }`), or remove the guard entirely and replace the warn with a comment. Alternatively, scope the warn with `typeof process !== "undefined" && process.env.NODE_ENV !== "production"`.
- **Confidence:** High

---

## Verified Good / Non-issues

The following security-relevant properties were verified by direct code inspection and command output:

- **No `dangerouslySetInnerHTML`** — `git grep` returned no results across all packages.
- **No `eval()` or `new Function`** — `git grep` returned no results across all packages.
- **No direct `innerHTML` writes** — `git grep` returned no results in source files.
- **No `document.cookie` access** — `git grep` returned no results.
- **No `postMessage` usage** — `git grep` returned no results.
- **No `window.open` calls** — `git grep` returned no results.
- **No `target="_blank"` without `rel`** — `git grep` returned no results.
- **No hardcoded secrets, tokens, passwords, or API keys** — verified.
- **All React rendering of workflow-controlled data uses React's automatic escaping.** State names, transition names, processor names, workflow names, criterion values, and comment text are all rendered as React JSX text children (`{value}`) or SVG `<text>` children — never as HTML. React encodes these as text nodes, preventing XSS.
- **`title` attributes on state nodes and transition edges use React attribute rendering** (auto-escaped). `RfStateNode.tsx:110` renders `title={`${category} · ${node.stateCode}`}` and `RfTransitionEdge.tsx:122` renders `title={edge.summary.full}`. React renders these as DOM attribute values, not innerHTML.
- **Monaco model URI uses a fixed `cyoda://workflow/` prefix** (not derived from workflow names). The model URI defaults to `"cyoda://workflow/editor.json"` in `WorkflowJsonEditor.tsx`. No workflow-controlled data enters the URI.
- **localStorage data is not exported into workflow JSON.** The `serializeImportPayload` / `serializeForModel` path serializes only the `WorkflowSession` (domain data). `WorkflowUiMeta` (layout, comments, viewports) is editor-side metadata only.
- **Demo package `@cyoda/docs-embed-demo` is `private: true`** — verified in `apps/docs-embed-demo/package.json`.
- **Changesets ignores the demo package** — `"ignore": ["@cyoda/docs-embed-demo"]` in `.changeset/config.json`.
- **Release preflight explicitly checks that private packages remain private** — `scripts/release-preflight.mjs` asserts `manifest.private === true` for both `cyoda-workflow-editor` and `@cyoda/docs-embed-demo`.
- **All public packages declare `files` arrays** limiting publish to `["dist", "README.md", "LICENSE"]`. No test files, source files, or demo content are included.
- **All public packages declare `publishConfig.provenance: true`** — npm provenance attestation will be generated via the `id-token: write` OIDC grant.
- **No postinstall or preinstall scripts** in any package — verified by inspecting all `package.json` files.
- **Malformed JSON does not corrupt canonical state.** `parseJsonSafe` wraps `JSON.parse` in try/catch; `liftJsonToPatch` returns `{ status: "invalid-json" }` on failure without dispatching a patch.
- **No hardcoded local/backend URLs** in the demo app source — verified by grep.
- **No demo-only code in published packages.** The demo app is a separate workspace package with no re-export relationship to the public packages.
- **`parseImportPayload` catches errors** from `normalizeOperatorAlias` and returns a structured error result rather than throwing.
- **The `reconnectError` message rendered in `WorkflowEditor.tsx:707`** is a React text child (`{reconnectError}`), not HTML injection. The string values are either hardcoded error messages or transition names rendered as text.
- **All 203 tests pass** (`pnpm test`).
- **Build succeeds** (`pnpm build`).
- **Release preflight passes** (`node ./scripts/release-preflight.mjs`).

---

## Commands and Tools Run

| Command / tool | Result | Notes |
|---|---|---|
| `pnpm audit` | 3 moderate | All in devDependencies; 0 in published runtime deps |
| `pnpm lint` | FAIL | 2 unused-var errors in ProcessorForm.tsx |
| `pnpm typecheck` | FAIL | Same 2 errors as lint |
| `pnpm test` | PASS | 203 tests across 28 files |
| `pnpm build` | PASS | All 6 packages built successfully |
| `node ./scripts/release-preflight.mjs` | PASS | All 6 public packages validated |
| `git grep -n "dangerouslySetInnerHTML"` | Clean | No results |
| `git grep -n "eval("` | Clean | No results |
| `git grep -n "new Function"` | Clean | No results |
| `git grep -n "innerHTML"` | Clean | No results in source; found only in `.changeset` and `README.md` docs |
| `git grep -n "localStorage"` | Found | Legitimate use in `WorkflowEditor.tsx`; also in tests and docs |
| `git grep -n "document.cookie"` | Clean | No results |
| `git grep -n "postMessage"` | Clean | No results |
| `git grep -n "window.open"` | Clean | No results |
| `git grep -n 'target="_blank"'` | Clean | No results |
| `git grep -n "process.env"` | Found | `workflow-viewer/src/WorkflowViewer.tsx:68` (dev warn only); `scripts/release-preflight.mjs:49` (legitimate env pass-through) |
| `git grep -n "NPM_TOKEN"` | Found | GitHub Actions secrets reference only; not hardcoded |
| `git grep -n "GITHUB_TOKEN"` | Found | GitHub Actions secrets reference only; not hardcoded |
| `git grep -n '"secret"'` | Clean | No results in source |
| `git grep -n '"password"'` | Clean | No results |
| `git grep -n "apiKey"` | Clean | No results |
| `git status --short` | Untracked | `ai/code-review-2.md` untracked |

`pnpm build` was run without `--frozen-lockfile` since this is a local audit; the lockfile was not modified.

---

## Dependency and Supply Chain Review

**Package manager and lockfile:** `pnpm@9.15.9` with `pnpm-lock.yaml` committed. `pnpm install --frozen-lockfile` is used in CI. No inconsistencies observed.

**Install lifecycle scripts:** No `postinstall`, `preinstall`, or `install` scripts are declared in any workspace package, including the root. First-party packages run only `build`, `test`, `typecheck`.

**Release scripts:** `scripts/release-preflight.mjs` uses `execFileSync("npm", ["pack", "--dry-run"])` for each public package — this invokes `npm` directly with a fixed argument list, not via shell, so no shell injection risk. `scripts/release-publish.mjs` uses `spawnSync("pnpm", [...], { shell: process.platform === "win32" })` — on Windows this enables shell expansion; this is a low risk in the CI environment but worth noting.

**GitHub Actions release workflow:**
- Uses `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `changesets/action@v1` — all mutable tags (see HIGH-001).
- `permissions: id-token: write` is granted at the job level, meaning every step in the job has access to the OIDC token, not just the publish step.
- `manual-branch-publish` job has no `permissions` block — it inherits the repository default permissions, which may vary by repo settings.
- `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` is used for authentication. npm trusted publishing (keyless OIDC auth) is not configured; NPM_TOKEN is a long-lived secret. Provenance is declared (`publishConfig.provenance: true`) and the OIDC grant is in place, but npm auth still requires the token.

**Changesets configuration:** `"ignore": ["@cyoda/docs-embed-demo"]` prevents the demo from being version-bumped or published. `"access": "public"` is set at the changeset level as well as per-package.

**`files` arrays:** All six public packages restrict publish to `["dist", "README.md", "LICENSE"]`. Source files, tests, fixtures, bench files, and internal tooling are excluded. Verified via `release-preflight.mjs` dry-run.

**Private package flags:** Root `package.json` and `apps/docs-embed-demo/package.json` both set `"private": true`. The preflight script asserts this for both.

**Provenance:** All public packages declare `"provenance": true` in `publishConfig`. GitHub Actions holds `id-token: write`. Provenance attestation should be generated automatically on publish via npm ≥ 9.5.

**Dependency audit result:** 3 moderate findings — all confined to `devDependencies` (`vitest`, `jsdom`). No runtime dependency vulnerabilities found. The published packages' runtime dependencies (`zod`, `immer`, `uuid`, `elkjs`, `jsonc-parser`, `zod-to-json-schema`) are not flagged.

---

## XSS and Rendering Review

All UI rendering of workflow-controlled data was reviewed. The following fields enter the React render tree:

| Field | Location | Rendering | XSS risk |
|---|---|---|---|
| `node.stateCode` | `StateNode.tsx`, `RfStateNode.tsx` | React SVG `<text>` / JSX text | None — React text node |
| `edge.summary.display` | `EdgeLabel.tsx`, `RfTransitionEdge.tsx` | React SVG `<text>` / JSX div child | None |
| `edge.summary.full` | `RfTransitionEdge.tsx:122` | HTML `title` attribute | None — React attribute escape |
| `node.stateCode` + `category` | `RfStateNode.tsx:110` | HTML `title` attribute | None — React attribute escape |
| `comment.text` | `CommentNode.tsx` | React text child / textarea value | None — React text node |
| Issue messages | `IssuesList`, `IssuesDrawer` | React text child | None |
| `processor.name` in modal title | `ProcessorForm.tsx:647` | JSX string interpolation in `title` attr | None — React attribute |
| `transition.name` in reconnect error | `WorkflowEditor.tsx` | React text child `{reconnectError}` | None |

No `dangerouslySetInnerHTML`, no direct `innerHTML`, no SVG injection via unescaped strings, no unsafe markdown rendering, no URL fields rendered as anchor `href` from workflow-controlled data, and no `target="_blank"` without `rel` were found.

React's JSX compilation automatically calls `document.createTextNode` (or sets attribute values via DOM APIs) for interpolated values, preventing script injection from any of these fields.

---

## JSON Parsing and Validation Review

**Parsing pipeline:** `JSON.parse` (wrapped, safe) → `normalizeOperatorAlias` (try/catch) → `ImportPayloadSchema.safeParse` (Zod, does not throw) → `normalizeWorkflowInput` (recursive — see HIGH-002) → `assignSyntheticIds` → `validateSemantics` (recursive walkCriteria — see HIGH-002).

**Malformed JSON:** `parseJsonSafe` catches all `JSON.parse` errors. `liftJsonToPatch` returns `{ status: "invalid-json" }` without modifying the canonical document.

**Zod schema bounds:** The `ImportPayloadSchema` and `WorkflowSchema` define `z.array(...).min(1)` on `workflows` and `transitions` but impose **no upper bounds** on the number of workflows, states per workflow, transitions per state, or processors per transition. A payload with 100 000 states or 100 000 transitions would be parsed without size rejection. Combined with the criteria depth issue (HIGH-002), this means very large payloads have no early rejection path.

**Prototype pollution:** `coerceCanonicalDefaults` in `parse-import.ts` spreads parsed object values using `{ ...v }`, `{ ...w }`, `{ ...s }`, `{ ...tx }`, `{ ...proc }`. It only spreads from objects already validated to be `Record<string, unknown>` via `isObj`. The `isObj` guard is `typeof v === "object" && v !== null && !Array.isArray(v)`. A JSON object with `"__proto__"` or `"constructor"` keys can pass this check. However, because this runs *before* Zod validation and the spreads produce new plain objects (not Object.assign to an existing object prototype), no actual prototype mutation occurs. Post-spread, Zod's `safeParse` then validates the shape strictly. Prototype pollution risk is **not present** in the current implementation.

**Cycle/depth controls:** `criterionMaxDepth` uses an iterative DFS stack and is safe. The semantic validator's call to `criterionDepthRules` correctly detects depths ≥ `MAX_CRITERION_DEPTH = 50` and emits an error. However, this check runs after the unsafe recursive passes (see HIGH-002).

**Monaco invalid JSON isolation:** `attachWorkflowJsonController` checks `if (suppressChange) return` to suppress re-entrant changes. `liftJsonToPatch` returns early on invalid JSON without dispatching, so the canonical model is unchanged if Monaco content is unparseable. Verified in `bridge.ts`.

---

## LocalStorage / Client Persistence Review

**What is stored:** The `WorkflowUiMeta` structure per workflow name — layout node positions (`Record<stateCode, {x,y}>`), comment text and positions, edge anchors, and viewport coordinates. Workflow JSON (domain session data) is not stored in localStorage.

**Key construction:** The key is the `localStorageKey` prop (default `"cyoda-editor-layout"`). No user-controlled input enters the key by default. Risk exists if the host derives the key from user input (see MEDIUM-002).

**Unbounded writes:** Comment text has no enforced length limit (see MEDIUM-003). Layout node positions and viewport data are bounded by the number of states in the workflow, which has no upper bound in the Zod schema.

**Parse failure handling:** `localStorage.getItem` result is wrapped in try/catch (`WorkflowEditor.tsx:157-170`). On parse failure, the original document is returned unchanged. This is safe.

**Write failure handling:** `localStorage.setItem` is wrapped in try/catch that silently swallows `QuotaExceededError`. No user notification. See MEDIUM-003.

**Key collisions across origins:** Not possible by definition (localStorage is per-origin).

**Stale metadata:** On mount, stored `WorkflowUiMeta` is merged into `initialDocument` using `{ ...(merged[wfName] ?? {}), ...ui }`. If a stale entry uses a workflow name that no longer exists in the loaded document, it is silently ignored (the merge produces an orphaned key in `workflowUi` that is never rendered).

---

## Monaco / JSON Editor Review

**Schema registration:** `registerWorkflowSchema` in `schema.ts` generates a JSON Schema from `ImportPayloadSchema` via `zod-to-json-schema` and registers it with Monaco's JSON language service using a fixed URI `https://cyoda.dev/schemas/workflow-import.schema.json` and a fixed `fileMatch` prefix `cyoda://workflow/*`. No user-controlled data enters the schema URI or file match pattern.

**Model URI:** Defaults to `"cyoda://workflow/editor.json"` in `WorkflowJsonEditor.tsx`. Can be overridden via `config.modelUri` (host-supplied). If a host passes a user-controlled string as `modelUri`, it is passed to `monaco.Uri.parse()`; malformed or unusually long URIs could confuse Monaco's model registry but not cause XSS (Monaco's URI handling is internal). This is LOW risk.

**Invalid JSON handling:** Verified — `liftJsonToPatch` returns `{ status: "invalid-json" }` and does not dispatch. Monaco markers show validation errors. The canonical document is unchanged.

**Disposal and lifecycle:** `attachWorkflowJsonController` exposes a `dispose()` method that cancels the debounce timer and removes the `onDidChangeContent` listener. `WorkflowJsonEditor.tsx` calls `dispose()` on unmount. Memory leak risk from undisposed listeners is guarded.

**Debounce:** Default 300 ms. No rate limit on successive parses. This is the vector for the DoS described in HIGH-002.

**Model creation:** `monaco.editor.createModel` is called once per editor mount, not on every document change. Subsequent changes update the model content via `syncFromDocument`. Multiple mounts without unmounting would create multiple models; the `if (editorRef.current) return` guard in the effect prevents duplicate creation within a single React tree.

---

## Demo App Review

**Private and excluded:** `@cyoda/docs-embed-demo` is `"private": true` in its `package.json`. It is listed in the changesets `ignore` array. The release preflight asserts it remains private. It will not be published to npm.

**Local backend URLs:** No hardcoded `localhost`, `127.0.0.1`, or `0.0.0.0` URLs were found in `apps/docs-embed-demo/src/`.

**Vite config:** `apps/docs-embed-demo/vite.config.ts` aliasing resolves `@cyoda/workflow-react` to the local source tree. No external network references. `server: { port: 5173 }` — no `host: "0.0.0.0"` or CORS bypass configuration found.

**Fixture content rendering:** Demo pages render fixture workflow JSON through the same `parseImportPayload` → React rendering pipeline as the production packages. No unsafe patterns observed in demo pages.

**Accidental publication:** Not possible given `private: true` and preflight guard.

---

## Package Boundary Review

**Viewer package:** `@cyoda/workflow-viewer` depends only on `@cyoda/workflow-core` and `@cyoda/workflow-graph`. It has no Monaco, ReactFlow, or editor-state dependencies. The SVG renderer uses only React and SVG primitives. No editor code leaks into the viewer.

**Core package:** `@cyoda/workflow-core` has no browser globals in source — `localStorage`, `window`, `document`, `process` are not referenced (only `process.env.NODE_ENV` appears in the viewer, not core). Core uses `uuid`, `immer`, and `zod` — all pure JS libraries.

**Monaco package:** Monaco is declared as a peer dependency (`"monaco-editor": ">=0.45 <0.53"`). The package does not bundle Monaco. React/react-dom are optional peer dependencies. The public API exports `attachWorkflowJsonController`, `registerWorkflowSchema`, `revealIdInEditor`, `attachCursorSelectionBridge` — no unsafe helpers are publicly exported.

**React package:** Does not re-export or expose demo pages or test utilities. The public API (`index.ts`) exports only the `WorkflowEditor` component and its associated types.

**No cross-package private file imports:** Each package imports from sibling packages via the declared `workspace:*` dependency (resolved via the package `exports` field), not via direct `../../` paths to internal files.

---

## Release Security Review

**GitHub Actions (`.github/workflows/release.yml`):**
- `permissions: id-token: write, contents: write, pull-requests: write` are set at the job level. `id-token: write` in particular is granted to all steps, not only the publish step. The `manual-branch-publish` job has no explicit `permissions` block and inherits repository defaults.
- **All four `uses:` references are now pinned to full commit SHAs** (HIGH-001 fixed). The `manual-branch-publish` job's three actions are pinned to the same SHAs as the `main-release` job.
- `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` is injected at the publish step. If the NPM_TOKEN secret scope includes all packages in the `@cyoda` npm org, a workflow compromise could publish to any `@cyoda` package, including ones not in this repository.

**Release scripts:**
- `release-preflight.mjs` correctly validates private flags, files arrays, build artifacts, license, repository URLs, and pack output before publish is allowed.
- `release-publish.mjs` delegates to `pnpm exec changeset publish`, which respects the `ignore` list. No local `npm publish` is called directly.
- On Windows, `spawnSync("pnpm", args, { shell: true })` enables shell expansion; in CI (Linux) this is not the case.

**Changesets configuration:**
- `"access": "public"` at the changeset level aligns with per-package `publishConfig.access: "public"`.
- `baseBranch: "main"` — changesets only generates version PRs from `main`.

**npm provenance:** `publishConfig.provenance: true` is set in all public packages. The GitHub Actions `id-token: write` permission satisfies the OIDC requirement for `npm publish --provenance`. Provenance should be generated automatically. This is correctly configured.

**NPM_TOKEN scope:** Cannot be verified without access to the npm organization settings. If the token has publish rights to all `@cyoda/*` packages, the blast radius of a token leak is the entire scope. Recommend scoping the token to only the packages in this repository if the npm org contains other packages.

---

## Recommended Fix Order

1. ~~**[HIGH-001] Pin GitHub Actions to commit SHAs.**~~ ✅ **FIXED** — All four actions in `release.yml` pinned to full commit SHAs.

2. ~~**[HIGH-002] Add pre-recursion depth guards to `normalizeCriterion`, `walkInner`, and add a JSON payload size limit in `parseImportPayload`.**~~ ✅ **FIXED** — Size limit, iterative depth guard, and per-function depth guards implemented with 12 regression tests.

3. **[MEDIUM-001] Upgrade vitest / override transitive dev deps** (esbuild, vite, ws) to patched versions. Does not block public release — only affects developer machines.

4. **[MEDIUM-002] Document that `localStorageKey` must not derive from user-controlled input.** Does not block public release but should be addressed before any version ≥ 1.0.

5. **[MEDIUM-003] Add `maxLength` to the comment textarea and surface a warning on `QuotaExceededError`.** Does not block public release.

6. ~~**[LOW-001] Fix the two unused-variable errors in ProcessorForm.tsx.**~~ ✅ **FIXED**

7. **[LOW-002] Review `ai/code-review-2.md` and add to `.gitignore` if appropriate.**

8. **[LOW-003] Replace `process.env.NODE_ENV` in the viewer package with a build-time constant.**

---

## Final Security Recommendation

~~Do not release until HIGH-001 and HIGH-002 are fixed.~~ Both blocking issues have been resolved. The project is now **ready to release** pending the medium-severity items, none of which block the initial public release. The two remaining medium issues (localStorage documentation and comment textarea size) are low-impact and can be addressed in a follow-up patch release before or shortly after v1.0.
