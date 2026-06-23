# Canonical Pinned Dependency Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge the monorepo onto one exact-pinned, catalog-centralized, latest-stable (cooldown-cleared) dependency matrix on pnpm 10 with supply-chain hardening, landed as verified per-layer commits.

**Architecture:** Layered convergence. First harden the toolchain (pnpm 10, cooldown, build-script allowlist, SHA-pinned Actions). Then centralize every shared version into a pnpm `catalog:` at *current* versions (pure restructure, no upgrades). Then bump the catalog entries to latest-cooled in dependency order — build/test tooling, lint, types/runtime, zod 4, react 19 — each a green commit. Finally reconfigure Dependabot for grouped, cooldown-respecting incremental updates.

**Tech Stack:** pnpm 10 workspaces + catalogs, Changesets, tsup, vite 8, vitest 4, eslint 10 (flat), TypeScript 6, React 19, zod 4.

## Global Constraints

- Exact-pin every **direct** dependency — no `^`/`~`. Peer dependencies are the deliberate exception: they stay permissive ranges and are *widened*.
- "Latest stable" means **the latest version of the target major line that has cleared the 14-day `minimumReleaseAge` cooldown** — never the absolute-newest if it is <14 days old. The cooldown (set in Task 1) enforces this automatically during resolution.
- Single source of truth: every shared version is one `catalog:` entry in `pnpm-workspace.yaml`; manifests reference `catalog:`. Peer ranges and `workspace:*` stay literal in manifests.
- Supply chain: pnpm 10 + 14-day cooldown (`minimumReleaseAge: 20160`) + explicit `onlyBuiltDependencies` allowlist + `.npmrc` registry pin (already present) + `provenance` (already present) + all GitHub Actions SHA-pinned with `# vX.Y.Z` comments.
- Every layer must be green — `pnpm typecheck && pnpm build && pnpm test`, plus `pnpm lint` from Task 4 on — before its commit. No layer lands red.
- `engines.node` floor is `>=20.19`; CI runners use Node 22 LTS.
- Published peer-surface changes (react peer widening, zod 4) ripple to `cyoda-dev-console` — out of scope here, tracked as a follow-up (spec §8).
- pnpm **11** is intentionally not used: it renames the build allowlist (`onlyBuiltDependencies` → `allowBuilds`); the design targets the stable 10.x surface.
- `@cyoda/*` cross-deps are `workspace:*` and never change. The private root package and `@cyoda/docs-embed-demo` are not published.

## Manifest & Config File Map

Files touched across the plan:
- `package.json` (private root) — `packageManager`, `engines`, devDeps → `catalog:`, existing `pnpm.overrides` pruned over time.
- `pnpm-workspace.yaml` — `catalog:`, `minimumReleaseAge`, `minimumReleaseAgeExclude`, `onlyBuiltDependencies`.
- `packages/workflow-core/package.json` — deps `immer,uuid,zod,zod-to-json-schema,jsonc-parser`; devDeps `fast-check`.
- `packages/workflow-graph/package.json`, `packages/workflow-layout/package.json` — deps incl. `elkjs`.
- `packages/workflow-monaco/package.json` — `monaco-editor` (dep + peer), react peers.
- `packages/workflow-react/package.json` — `reactflow`, react peers/devDeps, `jsdom`, `@testing-library/react`.
- `packages/workflow-viewer/package.json` — react peers/devDeps, `jsdom`, `@testing-library/react`.
- `apps/docs-embed-demo/package.json` — `react`,`react-dom`,`reactflow`,`monaco-editor`,`vite`,`@vitejs/plugin-react`,`jsdom`,`@testing-library/react`,`@playwright/test`,`@types/react(-dom)`.
- `.eslintrc.cjs` → delete; `eslint.config.js` → create (flat).
- `.github/workflows/ci.yml`, `release.yml`, `release-preflight.yml` — Node 22, SHA-pinned Actions.
- `.github/dependabot.yml` — grouping + cooldown.

## Catalog target versions (the single matrix)

Task 2 seeds the catalog with **current** resolved versions. Tasks 3–7 raise these entries to the latest-cooled version of the listed line. Target lines:

| catalog key | current | target line | task |
|---|---|---|---|
| `@changesets/cli` | 2.31.0 | 2.x | (stays) |
| `@playwright/test` | 1.61.1 | 1.x latest | 3 |
| `@testing-library/react` | 14.3.1 | 16.x | 7 |
| `@types/node` | 20.19.x | 26.x | 5 |
| `@types/react` | 18.x | 19.x | 7 |
| `@types/react-dom` | 18.x | 19.x | 7 |
| `@typescript-eslint/eslint-plugin` | 7.18.0 | 8.x | 4 |
| `@typescript-eslint/parser` | 7.18.0 | 8.x | 4 |
| `@vitejs/plugin-react` | 4.7.0 | 6.x (vite 8) | 3 |
| `@vitest/coverage-v8` | 3.2.6 | 4.x | 3 |
| `eslint` | 8.57.1 | 10.x | 4 |
| `fast-check` | 3.23.2 | 4.x | 5 |
| `immer` | 10.2.0 | 11.x | 5 |
| `jsdom` | 24.1.3 | 29.x | 3 |
| `jsonc-parser` | 3.2.x | 3.x latest | 5 |
| `monaco-editor` | 0.52.2 | 0.55.x | 7 |
| `prettier` | 3.8.4 | 3.x latest | 4 |
| `react` | 18.3.1 | 19.x | 7 |
| `react-dom` | 18.3.1 | 19.x | 7 |
| `reactflow` | 11.11.4 | 11.x (kept) | — |
| `tsup` | 8.5.1 | 8.x latest | 3 |
| `typescript` | 5.9.3 | 6.x | 5 |
| `uuid` | 14.0.1 | 14.x (kept) | — |
| `vite` | 6.4.3 | 8.x | 3 |
| `vitest` | 3.2.6 | 4.x | 3 |
| `zod` | 3.25.76 | 4.x | 6 |
| `zod-to-json-schema` | 3.x | zod-4-compatible | 6 |

"latest-cooled" = run the bump with a caret range, let `minimumReleaseAge` cap selection, then read the resolved version and pin it exactly in the catalog (Step pattern in each task).

---

### Task 1: Toolchain & supply-chain hardening

Establishes pnpm 10, the cooldown, the build-script allowlist, the Node floor, Node 22 in CI, and SHA-pinned Actions. No dependency versions change; the suite stays green at current versions.

**Files:**
- Modify: `package.json` (`packageManager`, `engines`)
- Modify: `pnpm-workspace.yaml` (add settings block)
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/release-preflight.yml`

**Interfaces:**
- Produces: pnpm 10 in `packageManager`; `pnpm-workspace.yaml` settings keys `minimumReleaseAge`, `onlyBuiltDependencies`; Node-22 CI. Later tasks rely on the cooldown being active so their bumps resolve to cooled versions.

- [ ] **Step 1: Adopt pnpm 10 via corepack (writes exact `packageManager`)**

```bash
corepack use pnpm@10   # resolves latest 10.x, updates package.json "packageManager"
pnpm --version         # expect 10.x.y
```

- [ ] **Step 2: Set the Node engine floor**

In `package.json`, change `"engines": { "node": ">=20" }` to:

```json
"engines": { "node": ">=20.19" }
```

- [ ] **Step 3: Add supply-chain settings to `pnpm-workspace.yaml`**

Append to `pnpm-workspace.yaml` (keep the existing `packages:` block):

```yaml
# Supply-chain hardening (pnpm 10)
# 14 days = 14*24*60 = 20160 minutes. No version younger than this enters the lockfile.
minimumReleaseAge: 20160
minimumReleaseAgeExclude:
  - "@cyoda/*"
# Only these packages may run install lifecycle scripts (pnpm 10 blocks all others).
# Seeded with esbuild; add any package pnpm reports under "Ignored build scripts" in Step 5.
onlyBuiltDependencies:
  - esbuild
```

- [ ] **Step 4: SHA-pin every GitHub Action**

For each distinct `uses:` across the three workflow files, resolve the tag to a commit SHA and pin with a version comment. Resolve a SHA with:

```bash
gh api repos/actions/checkout/git/refs/tags/v4 --jq '.object.sha'   # example
```

Pin all occurrences to the `# vX` form, e.g. in every workflow file:

```yaml
- uses: actions/checkout@<sha>          # v4
- uses: actions/setup-node@<sha>        # v4
- uses: pnpm/action-setup@<sha>         # v4
- uses: actions/dependency-review-action@<sha>  # v4
- uses: changesets/action@<sha>         # v1
```

Use the already-present SHAs where they exist (`actions/checkout@34e1148…`, `actions/setup-node@49933ea…`, `pnpm/action-setup@b906aff…`, `changesets/action@63a615b…`) and replace the remaining `@v4`/`@v5` tag references so no `uses:` line ends in a bare tag.

This task establishes the **SHA-pin invariant** at the current action major versions. Bumping action majors to latest (setup-node 6, pnpm/action-setup 6, dependency-review 5) is delegated to the grouped `github-actions` Dependabot PR configured in Task 8 — it will arrive as a single reviewable PR rather than being bundled into this hardening task.

- [ ] **Step 5: Set CI Node to 22 and reinstall under pnpm 10**

In all three workflow files, set `node-version: 22` in the `actions/setup-node` step (currently `20`). Then locally:

```bash
pnpm install --frozen-lockfile
```

Expected: install succeeds. If pnpm prints `Ignored build scripts: <pkg>…`, add each named package to `onlyBuiltDependencies` in `pnpm-workspace.yaml` and re-run `pnpm install`.

- [ ] **Step 6: Verify green at current versions**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: typecheck clean; build all packages; **496 tests pass** (workflow-core 194, workflow-react 247, workflow-viewer 16, workflow-layout 14, workflow-graph 13, workflow-monaco 12).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .github/workflows/
git commit -m "build: pnpm 10 + cooldown + build allowlist + SHA-pinned Actions + Node 22"
```

---

### Task 2: Catalog restructure at current versions

Introduce the default `catalog:` seeded with the **current** resolved versions and migrate every manifest dependency to `catalog:`. Pure restructure — no version changes, suite stays green. This isolates "centralize + exact-pin" from "upgrade".

**Files:**
- Modify: `pnpm-workspace.yaml` (add `catalog:` map)
- Modify: all 8 manifests (deps/devDeps → `catalog:`; peers stay literal)

**Interfaces:**
- Consumes: Task 1's `pnpm-workspace.yaml`.
- Produces: the `catalog:` map (keys per the matrix table). Tasks 3–7 bump only catalog values.

- [ ] **Step 1: Read current resolved versions**

```bash
pnpm ls -r --depth -1   # or read pnpm-lock.yaml importer specifiers
```

Record the exact installed version of each catalog key (the "current" column of the matrix table).

- [ ] **Step 2: Add the `catalog:` map to `pnpm-workspace.yaml`**

Add a `catalog:` block with **exact** current versions, e.g.:

```yaml
catalog:
  "@changesets/cli": 2.31.0
  "@playwright/test": 1.61.1
  "@testing-library/react": 14.3.1
  "@types/node": 20.19.39
  "@types/react": 18.3.28
  "@types/react-dom": 18.3.7
  "@typescript-eslint/eslint-plugin": 7.18.0
  "@typescript-eslint/parser": 7.18.0
  "@vitejs/plugin-react": 4.7.0
  "@vitest/coverage-v8": 3.2.6
  eslint: 8.57.1
  fast-check: 3.23.2
  immer: 10.2.0
  jsdom: 24.1.3
  jsonc-parser: 3.2.1
  monaco-editor: 0.52.2
  prettier: 3.8.4
  react: 18.3.1
  react-dom: 18.3.1
  reactflow: 11.11.4
  tsup: 8.5.1
  typescript: 5.9.3
  uuid: 14.0.1
  vite: 6.4.3
  vitest: 3.2.6
  zod: 3.25.76
  zod-to-json-schema: 3.24.6
```

Replace each value with the exact version recorded in Step 1 (the placeholders above are the expected current values; reconcile against `pnpm ls`).

- [ ] **Step 3: Point every manifest dependency at the catalog**

In each of the 8 manifests, replace the literal version of every dependency/devDependency that has a catalog key with `"catalog:"`. Leave `workspace:*`, peer ranges, and any dep without a catalog key untouched. Example (`packages/workflow-core/package.json`):

```json
"dependencies": {
  "immer": "catalog:",
  "jsonc-parser": "catalog:",
  "uuid": "catalog:",
  "zod": "catalog:",
  "zod-to-json-schema": "catalog:"
},
"devDependencies": {
  "fast-check": "catalog:"
}
```

Peer blocks keep literal ranges, e.g. `packages/workflow-react/package.json`:

```json
"peerDependencies": {
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "reactflow": "^11"
}
```

- [ ] **Step 4: Reinstall and confirm zero version drift**

```bash
pnpm install --no-frozen-lockfile
git diff --stat pnpm-lock.yaml
```

Expected: lockfile importer entries now read `version: x (catalog)`; resolved versions are **unchanged** from Task 1 (no package version moved). If any resolved version changed, a catalog value is wrong — fix it.

- [ ] **Step 5: Verify green**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: same 496 passing tests, clean typecheck/build.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml '**/package.json' pnpm-lock.yaml
git commit -m "build: centralize all shared deps into pnpm catalog (no version changes)"
```

---

### Task 3: Build & test tooling → latest-cooled

Raise tsup, vite, vitest (+coverage), @vitejs/plugin-react, jsdom, @playwright/test. This is the vite 6→8 + vitest 3→4 jump.

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog values for the keys below)
- Possibly modify: `packages/*/vitest.config.ts`, `apps/docs-embed-demo/vite.config.ts` / `vitest.config.ts` (vitest 4 / vite 8 API)

**Interfaces:**
- Consumes: catalog from Task 2.
- Produces: vite 8, vitest 4 in catalog. Task 4+ run under them.

- [ ] **Step 1: Bump catalog values to latest-cooled**

In `pnpm-workspace.yaml` `catalog:`, set `vite`, `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `jsdom`, `tsup`, `@playwright/test` to a caret of the target line, e.g. `vite: ^8`, `vitest: ^4`, `@vitest/coverage-v8: ^4`, `@vitejs/plugin-react: ^6`, `jsdom: ^29`, `tsup: ^8`, `@playwright/test: ^1`. Then:

```bash
pnpm update -r vite vitest @vitest/coverage-v8 @vitejs/plugin-react jsdom tsup @playwright/test
```

The cooldown caps each at the newest version ≥14 days old.

- [ ] **Step 2: Pin the resolved versions exactly in the catalog**

```bash
pnpm ls -r --depth -1 | grep -E 'vite |vitest|jsdom|tsup|playwright|plugin-react'
```

Replace each caret in the `catalog:` with the exact resolved version, then `pnpm install --no-frozen-lockfile`.

- [ ] **Step 3: Verify; fix vite 8 / vitest 4 breakage**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Known breakage to expect and fix:
- **vite 8 Node floor:** already satisfied (engines `>=20.19`, CI Node 22).
- **vitest 4 config:** the per-package `vitest.config.ts` use only `test.include`, `test.environment`, `test.setupFiles` — stable in v4. If vitest 4 errors on an option, consult its migration guide and adjust the named option only.
- **`@vitejs/plugin-react` 6 ⟂ vite:** plugin-react 6 peers vite 8 — compatible now that vite is 8. (Do **not** bump plugin-react ahead of vite.)
- **docs `vite.config.ts`:** confirm `apps/docs-embed-demo` still builds: `pnpm --filter @cyoda/docs-embed-demo build`.

Expected after fixes: 496 tests pass; both library and docs builds succeed.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml '**/vitest.config.ts' '**/vite.config.ts'
git commit -m "build(deps): vite 8 + vitest 4 + jsdom 29 + tooling (latest-cooled)"
```

---

### Task 4: ESLint 10 flat config + typescript-eslint 8 + prettier

Migrate the legacy `.eslintrc.cjs` to flat `eslint.config.js`, bump eslint to 10 and typescript-eslint to 8, refresh prettier. Lint becomes a verified gate from here on.

**Files:**
- Delete: `.eslintrc.cjs`
- Create: `eslint.config.js`
- Modify: `pnpm-workspace.yaml` (`eslint`, `@typescript-eslint/*`, `prettier`)

**Interfaces:**
- Consumes: catalog from Task 3.
- Produces: a working `pnpm lint` on eslint 10 flat config.

- [ ] **Step 1: Bump catalog values**

Set `eslint: ^10`, `@typescript-eslint/eslint-plugin: ^8`, `@typescript-eslint/parser: ^8`, `prettier: ^3` in `catalog:`, then:

```bash
pnpm update -r eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
```

Pin resolved versions exactly in the catalog (per Task 3 Step 2 pattern); `pnpm install --no-frozen-lockfile`.

- [ ] **Step 2: Create `eslint.config.js` (flat) porting the old config**

```js
// Flat config (ESLint 10). Ports .eslintrc.cjs using typescript-eslint v8 helpers.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.cjs", "**/*.config.ts", "**/*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    },
  },
);
```

`typescript-eslint` (the v8 umbrella package) provides `tseslint.config` and `tseslint.configs.recommended`. Add it to the catalog and root devDeps if not already pulled by the plugin/parser:

```bash
# add the umbrella helper used by the flat config
echo '  typescript-eslint: ^8' # add to catalog: then:
# root package.json devDependencies: "typescript-eslint": "catalog:", "@eslint/js": "catalog:"
```

Add `typescript-eslint` and `@eslint/js` as catalog keys (latest-cooled 8.x / matching eslint 10) and as root devDeps referencing `catalog:`.

- [ ] **Step 3: Delete the legacy config**

```bash
git rm .eslintrc.cjs
```

- [ ] **Step 4: Run lint; fix new findings minimally**

```bash
pnpm lint
```

eslint 10 + ts-eslint 8 `recommended` may surface new findings. Fix genuine ones; for intentional patterns, narrow with inline `// eslint-disable-next-line <rule> -- reason`. Do **not** broaden the rule set. Re-run until clean.

- [ ] **Step 5: Verify full gate (lint now included)**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: all clean; 496 tests pass.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js pnpm-workspace.yaml pnpm-lock.yaml package.json
git rm .eslintrc.cjs
git commit -m "build(lint): migrate to ESLint 10 flat config + typescript-eslint 8"
```

---

### Task 5: Types & non-react runtime → latest-cooled

Bump TypeScript 6, @types/node 26, immer 11, fast-check 4, jsonc-parser, elkjs. Includes the `workflow-layout` smoke (thin coverage, spec Testing §).

**Files:**
- Modify: `pnpm-workspace.yaml` (`typescript`, `@types/node`, `immer`, `fast-check`, `jsonc-parser`, and add `elkjs` if not yet a catalog key)
- Possibly modify: source files with TS 6 / immer 11 type changes.

**Interfaces:**
- Consumes: catalog from Task 4.
- Produces: TS 6 + immer 11 baseline.

- [ ] **Step 1: Bump catalog values**

Set `typescript: ^6`, `@types/node: ^26`, `immer: ^11`, `fast-check: ^4`, `jsonc-parser: ^3`, and add `elkjs: ^0.11` (catalog key + `catalog:` ref in `packages/workflow-layout/package.json`). Then:

```bash
pnpm update -r typescript @types/node immer fast-check jsonc-parser elkjs
```

Pin resolved versions exactly; `pnpm install --no-frozen-lockfile`.

- [ ] **Step 2: Verify; fix TS 6 / immer 11 breakage**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Known breakage to expect:
- **TypeScript 6:** stricter defaults / removed deprecated flags. Fix type errors at the source; do not loosen `tsconfig` `strict`. `@typescript-eslint` 8 supports TS `<6.1.0` (peer verified).
- **immer 11:** dropped legacy ES5 fallback / `setUseProxies`. `workflow-core` uses `produce`/patches only — confirm no removed API is referenced (`grep -rn "setUseProxies\|enableES5\|enableAllPlugins" packages`). If found, remove the call (immer 11 has these on by default).
- **fast-check 4:** property-test API; run `pnpm --filter @cyoda/workflow-core test` and fix any renamed arbitrary.

- [ ] **Step 3: Manual smoke — workflow-layout (thin coverage)**

```bash
pnpm --filter @cyoda/docs-embed-demo dev
```

Open the served URL; confirm the graph lays out and edges route correctly (elkjs path). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml '**/package.json'
git commit -m "build(deps): TypeScript 6 + @types/node 26 + immer 11 + fast-check 4 + elkjs (latest-cooled)"
```

---

### Task 6: zod 3 → 4 migration (highest risk)

Bump zod to 4 and migrate the 8 schema files in `workflow-core` plus `zod-to-json-schema` compatibility. Isolated so it can be reverted independently.

**Files:**
- Modify: `pnpm-workspace.yaml` (`zod`, `zod-to-json-schema`)
- Modify: `packages/workflow-core/src/parse/parse-editor-document.ts`, `src/schema/{criterion,name,workflow,payload,operator,processor}.ts`, `src/validate/schema.ts`

**Interfaces:**
- Consumes: catalog from Task 5.
- Produces: zod 4 baseline. Fallback: pin `zod` at latest-cooled 3.x and stop (spec §4) if migration is too invasive.

- [ ] **Step 1: Bump catalog values**

Set `zod: ^4`; for `zod-to-json-schema`, check zod-4 compatibility first:

```bash
npm view zod-to-json-schema peerDependencies --registry=https://registry.npmjs.org
```

If `zod-to-json-schema` does not support zod 4, replace its usage with zod 4's native `z.toJSONSchema()` (search `grep -rn "zod-to-json-schema" packages/workflow-core/src`) and drop the dependency; otherwise pin its zod-4-compatible version. Then `pnpm update -r zod zod-to-json-schema` and pin exactly.

- [ ] **Step 2: Apply known zod-4 API migrations**

Audit and fix these concrete changes across the 8 files:
- **`z.record(z.unknown())`** (in `parse-editor-document.ts:27`) → `z.record(z.string(), z.unknown())` (zod 4 requires explicit key + value types).
- **`ZodError` usage** (`validate/schema.ts`): zod 4 exposes issues via `.issues`; if code reads `.errors`, switch to `.issues`.
- **Error customization:** any `{ message: "…" }` option on a refinement becomes `{ error: "…" }` in zod 4.
- The stable surface used here — `z.object`, `z.string().min`, `z.number().int().nonnegative()`, `z.enum`, `z.literal`, `z.array`, `z.boolean`, `.optional()` — is unchanged in zod 4.

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm build && pnpm --filter @cyoda/workflow-core test && pnpm test
```

Expected: workflow-core parse/validate/schema tests pass; 496 total. If migration cannot be made green within this task, invoke the fallback: revert to `zod: ^3` (latest-cooled), pin it, leave a note for a separate zod-4 effort, and proceed.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/workflow-core/
git commit -m "feat(deps)!: migrate workflow-core to zod 4"
```

---

### Task 7: React 19 + types + peer widening + monaco 0.55

The UI layer: react/react-dom 19, @types/react(-dom) 19, @testing-library/react 16, peer widening, monaco 0.55. Includes the layout+monaco smoke.

**Files:**
- Modify: `pnpm-workspace.yaml` (`react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `monaco-editor`)
- Modify: `package.json` (`pnpm.overrides` for `react`/`react-dom` → 19)
- Modify peers: `packages/workflow-react/package.json`, `packages/workflow-viewer/package.json`, `packages/workflow-monaco/package.json`
- Possibly modify: React component sources (react-19 type fixes)

**Interfaces:**
- Consumes: catalog from Task 6.
- Produces: the final react-19 baseline.

- [ ] **Step 1: Bump catalog + the existing react overrides together**

The root `package.json` has `pnpm.overrides` pinning `react`/`react-dom` to `^18.3.1` — update both to `^19` so the override does not pin the workspace back to 18. Set catalog `react: ^19`, `react-dom: ^19`, `@types/react: ^19`, `@types/react-dom: ^19`, `@testing-library/react: ^16`, `monaco-editor: ^0.55`. Then:

```bash
pnpm update -r react react-dom @types/react @types/react-dom @testing-library/react monaco-editor
```

Pin resolved versions exactly in catalog and overrides.

- [ ] **Step 2: Widen published peer ranges (do not pin peers)**

In `workflow-react`, `workflow-viewer`, `workflow-monaco` `peerDependencies`:

```json
"react": "^18.3.1 || ^19.0.0",
"react-dom": "^18.3.1 || ^19.0.0"
```

In `workflow-monaco`, widen the monaco peer from `>=0.45 <0.53` to:

```json
"monaco-editor": ">=0.45 <0.56"
```

Leave `reactflow` peer at `^11` (it peers `react >=17`).

- [ ] **Step 3: Verify; fix react-19 type breakage**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Known breakage to expect:
- **@types/react 19:** `children` is no longer implicit on `FC`/props — add explicit `children?: React.ReactNode` where used; `useRef` now requires an initial argument; `JSX.Element` namespace moved to `React.JSX`. Fix at the component source; do not cast to `any`.
- **react-dom 19:** `ReactDOM.render` removed — confirm the codebase already uses `createRoot` (`grep -rn "ReactDOM.render\|react-dom/client" packages apps`).
- Run the React-heavy suites: `pnpm --filter @cyoda/workflow-react test` and `--filter @cyoda/workflow-viewer test`. Reuse the existing reactflow mock pattern; check the 6 reactflow-importing files render.

Expected: 496 tests pass.

- [ ] **Step 4: Manual smoke — layout + monaco (thin coverage)**

```bash
pnpm --filter @cyoda/docs-embed-demo dev
```

Confirm under react 19: the graph lays out and edges route (`workflow-layout` via viewer), and the Monaco editor mounts and accepts edits (`workflow-monaco` 0.55). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml package.json '**/package.json'
git commit -m "feat(deps)!: React 19 + @types/react 19 + monaco 0.55 + peer widening"
```

---

### Task 8: Dependabot reconfiguration

Reshape Dependabot so future updates arrive grouped and cooldown-respecting, never a flood.

**Files:**
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing from prior tasks (config-only).
- Produces: grouped, cooldown-aware Dependabot.

- [ ] **Step 1: Rewrite `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    target-branch: "staging"
    schedule:
      interval: weekly
    cooldown:
      default-days: 14
    groups:
      dev-dependencies:
        dependency-type: development
        update-types: ["minor", "patch"]
      production-minor-patch:
        dependency-type: production
        update-types: ["minor", "patch"]
  - package-ecosystem: github-actions
    directory: /
    target-branch: "staging"
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ["*"]
```

(Confirm the `cooldown` key against current Dependabot docs at execution; if unsupported, rely on the pnpm `minimumReleaseAge` cooldown and keep only `groups`.)

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml')); print('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci(dependabot): group updates and respect a 14-day cooldown"
```

---

### Task 9: Final audit & push gate

Confirm the whole baseline, then push and verify CI + Dependabot.

**Files:** none (verification + push).

- [ ] **Step 1: Clean-room install under cooldown**

```bash
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install --frozen-lockfile
```

Expected: success with no cooldown rejection (all pinned versions are ≥14 days old or already locked) and no un-allowlisted build-script warnings.

- [ ] **Step 2: Full gate + audit**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm audit
```

Expected: all green; `pnpm audit` reports **0 vulnerabilities**, or only the documented `js-yaml@3.14.2` residual (Changesets `read-yaml-file` v3 API). If the Changesets toolchain is now current and no longer pulls js-yaml 3, the residual is gone — confirm.

- [ ] **Step 3: Prune now-redundant transitive overrides**

The `pnpm.overrides` added in `7e9baf9` (`form-data`, `@babel/core`, `esbuild`, `js-yaml`) may be moot once their parents are current (esbuild via vite 8, @babel/core via @vitejs/plugin-react 6, form-data via jsdom 29, js-yaml via current Changesets). For each, remove the override, run `pnpm install --no-frozen-lockfile && pnpm audit`, and keep it removed only if no advisory returns; otherwise restore it. Leave the `react`/`react-dom` overrides (now at 19, still needed to keep the tree pinned).

- [ ] **Step 4: Confirm exact-pin invariant**

```bash
# No caret/tilde in any direct dependency or catalog entry (peers may keep ranges)
grep -rnE '": "\^|": "~' package.json packages/*/package.json apps/*/package.json | grep -v peerDependencies || echo "all directs pinned"
grep -nE ':\s*\^|:\s*~' pnpm-workspace.yaml | grep -A0 -i catalog || echo "catalog fully pinned"
```

Expected: every direct dep is `catalog:` or an exact version; no carets in the catalog.

- [ ] **Step 5: Push and watch CI (outward-facing — confirm before pushing)**

```bash
git push origin staging
gh run list --branch staging --limit 4
```

Expected: CI `validate` and `Release Preflight` pass on Node 22 / pnpm 10.

- [ ] **Step 6: Trigger and confirm Dependabot is unblocked**

From the Dependabot dashboard (or `gh api`), re-run a previously failing npm security job and confirm it now resolves against npmjs without the GitHub-Packages stale-mirror failure.

---

## Notes for the executor

- **Order is load-bearing.** Tooling (3) before lint (4) before types/runtime (5) before zod (6) before react (7): each lands on a known-good base for the next. Do not reorder.
- **Every bump is two moves:** raise the catalog value to a caret of the target line, let the cooldown cap resolution, then pin the resolved version exactly. Never leave a caret in the catalog at commit time.
- **Pushes are gated.** Per the project's working agreement, pause for go-ahead before any `git push` (Task 9 Step 4) and before reconfiguring branch-level Dependabot behavior.
- **Fallbacks are real.** zod 4 (Task 6) and any single bump may fall back to "latest-cooled within the current major" if a migration cannot be made green in its task — record the deferral and continue; the final review decides if it blocks release.
