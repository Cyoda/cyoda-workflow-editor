# Canonical Pinned, Supply-Chain-Hardened, Latest-Stable Dependency Baseline — Design

**Date:** 2026-06-23
**Status:** Approved (design)
**Branch:** `staging`
**Repo:** `cyoda-workflow-editor` (monorepo: `@cyoda/workflow-core|graph|layout|monaco|react|viewer` + private root and `@cyoda/docs-embed-demo`)

## Goal

Replace the drifted, reactively-patched dependency tree with one deliberate,
exact-pinned, latest-stable, mutually-compatible baseline that is centralized
via pnpm catalogs and hardened against supply-chain attacks. After this lands,
Dependabot produces only incremental, grouped version bumps over time — never a
flood — and every installed version is one we chose and reviewed.

## Why

The tree had accumulated drift (e.g., a phantom `@types/uuid@9.0.8`, 56 caret
ranges vs 10 exact pins, the same dev deps declared at 3+ versions across
packages, mixed Action pinning). Iterative per-dependency bumps kept hitting
interlocking peer conflicts (e.g. `@vitejs/plugin-react@6` ⟂ `vite@6`). A single
coherent, pinned matrix verified once is more correct and durable than
bump-by-bump hacking.

## Global Constraints

- **Exact pins** for every *direct* dependency — no `^`, no `~`. Peer
  dependencies are the deliberate exception (see Version Policy).
- **Latest-stable, mutually-compatible** target versions.
- **Single source of truth:** every shared version is defined once in a pnpm
  `catalog:`; package manifests reference `catalog:` rather than literals.
- **Supply-chain posture:** pnpm 10 + `minimumReleaseAge: 14 days` cooldown +
  explicit build-script allowlist + registry pinned to npmjs + provenance +
  all GitHub Actions SHA-pinned.
- **Every layer must be green** (typecheck + build + test + lint) before its
  commit. No layer lands red.
- **Published peer surface changes are coordinated:** widening react peers and
  taking zod 4 in published packages ripples to `cyoda-dev-console` and is a
  major bump per `CLAUDE.md`. This spec covers THIS repo only; downstream
  validation is a tracked follow-up.

## Architecture

### 1. Version policy

- Direct deps: exact-pinned to latest stable.
- Peer deps: stay permissive *ranges*, widened to include new majors:
  - `react` / `react-dom` peers → `^18.3.1 || ^19.0.0` (in `workflow-react`,
    `workflow-viewer`, `workflow-monaco`).
  - `monaco-editor` peer in `workflow-monaco` (`>=0.45 <0.53`) → widened to
    include `0.55` (e.g. `>=0.45 <0.56`).
  - `reactflow` peer (`^11`) unchanged — `reactflow@11.11.4` peers `react >=17`,
    so it supports react 19 with no rename migration.
- Centralization: pnpm `catalog:` (default catalog) in `pnpm-workspace.yaml`.
  Each manifest dependency becomes `"pkg": "catalog:"`. Exact versions live only
  in the catalog. Peer ranges remain literal in manifests (catalogs are for
  resolved deps, not peer ranges).

### 2. Supply-chain hardening

- **Toolchain:** pnpm `9.15.9 → 10.x`, pinned via `packageManager` (corepack).
- **Cooldown:** a **14-day** `minimumReleaseAge` in pnpm config so no version
  younger than 14 days can enter the lockfile. The exact key location and value
  encoding (minutes vs. duration) are confirmed against the pnpm 10 docs during
  execution.
- **Build-script allowlist:** pnpm 10 blocks dependency lifecycle scripts by
  default; add an explicit `onlyBuiltDependencies` allowlist (at minimum
  `esbuild`; audit install output for others such as native bindings).
- **Registry pin:** `.npmrc` → `registry=https://registry.npmjs.org/` (already
  committed in `ea54407`).
- **Provenance:** `publishConfig.provenance: true` (already present).
- **GitHub Actions:** every `uses:` pinned to a full 40-char commit SHA with a
  trailing `# vX.Y.Z` comment. Currently mixed (some SHA, some `@v4`).

### 3. Target version matrix (latest stable at 2026-06-23)

Runtime: `react`/`react-dom` 19.2.7, `zod` 4.4.3, `immer` 11.1.8, `uuid` 14.0.1,
`reactflow` 11.11.4 (kept), `monaco-editor` 0.55.1.

Build/test/lint/types: `typescript` 6.0.3, `vite` 8.1.0, `vitest` +
`@vitest/coverage-v8` 4.1.9, `@vitejs/plugin-react` (latest compatible with vite
8), `eslint` 10.5.0, `@typescript-eslint/{eslint-plugin,parser}` 8.62.0,
`jsdom` 29.1.1, `@testing-library/react` 16.3.2, `fast-check` 4.8.0,
`@types/node` 26.0.0, `@types/react`/`@types/react-dom` 19.x, `tsup` 8.5.1,
`prettier` (latest 3.x), `@playwright/test` 1.61.1, `elkjs` 0.11.1,
`@changesets/cli` 2.31.0.

`engines.node` → `>=20.19` (vite 8 floor `^20.19.0 || >=22.12.0`). CI runners
pinned to **Node 22 LTS**.

All exact pin values are resolved and frozen during execution (Layer 2 onward);
the numbers above are the intended targets, subject to the 14-day cooldown
possibly holding back a just-published patch.

### 4. Code migrations entailed

- **eslint flat config:** migrate `.eslintrc.cjs` → `eslint.config.js` (eslint
  10 removes eslintrc support). Port the TypeScript parser/plugin setup using
  `typescript-eslint` v8 flat helpers.
- **@types/react 19:** stricter types (ref-as-prop, no implicit `children`, JSX
  namespace) will surface typecheck errors across React components — fix each.
- **zod 3 → 4 (highest risk):** migrate schema/parse/error usage in
  `workflow-core` (and any other zod consumer). If migration proves too invasive
  to land safely before release, the documented fallback is to pin `zod` at the
  latest 3.x and defer 4 to a separate effort.
- **vitest 3 → 4:** reconcile config/API changes across the per-package
  `vitest.config.ts` files.
- **react 19 runtime:** run the full suite; specifically exercise the 6
  `reactflow`-importing files under react 19.
- **monaco 0.55 + peer widening** in `workflow-monaco`.

### 5. Execution strategy — layered convergence

Land in dependency order; each layer is one reviewed commit that is green
(typecheck + build + test, plus lint from Layer 4 on) before proceeding.
Executed via `superpowers:subagent-driven-development`.

1. **Toolchain & hardening** — pnpm 10 + `packageManager` pin, `minimumReleaseAge`,
   `onlyBuiltDependencies` allowlist, SHA-pin all Actions, `engines.node`
   bump, CI Node → 22. (`.npmrc` already done.) Verify install + green suite at
   current versions.
2. **Catalog restructure (no version changes)** — introduce default `catalog:`
   seeded with the *current* resolved versions, exact-pinned; migrate all
   manifests to `catalog:` refs. Pure restructure; verify green. This isolates
   "centralize + pin" from "upgrade".
3. **Build/test tooling → latest** — tsup, vite 8 (+ plugin-react), vitest 4
   (+ coverage), jsdom 29, playwright 1.61. Verify.
4. **Lint → latest** — eslint 10 flat-config migration + typescript-eslint 8 +
   prettier. Verify `pnpm lint` + suite. (Lint becomes a verified gate here.)
5. **Types / runtime non-react** — @types/node 26, typescript 6, immer 11,
   fast-check 4, elkjs. Verify.
6. **zod 4 migration** — isolated, highest-risk; verify. Fallback per §4.
7. **react 19 layer** — react/react-dom 19, @types/react(-dom) 19, peer
   widening, monaco 0.55 + peer widening. Verify the full UI suite.

### 6. Dependabot reconfiguration

- Keep `target-branch: staging` for both ecosystems.
- Add **grouping** (e.g. group dev-dependencies, group minor/patch) so updates
  arrive as a few PRs, not one-per-dep.
- Align with the cooldown (Dependabot `cooldown` config) so it does not propose
  versions younger than 14 days.
- Pin-aware: Dependabot updates exact pins (and catalog entries) normally.

### 7. Disposition of current work

- **Keep** the four committed changes on `staging`: `ea54407` (registry pin +
  drop unused `@types/uuid`), `156e759` (vitest/vite security), `7e9baf9`
  (transitive overrides), `cd31904` (within-range patches). They are consistent
  with the target. Some `7e9baf9` overrides may become unnecessary once parents
  reach current versions (e.g. esbuild via vite 8) and should be pruned in the
  layer that makes them redundant; `js-yaml@3.14.2` (Changesets `read-yaml-file`
  v3 API) is re-checked after Changesets tooling is current.
- **Discard** the uncommitted Batch-3b working-tree changes (done) — redone
  under catalogs.

### 8. Downstream coordination (flag — not executed here)

Widening react peers to allow 19 and taking zod 4 in the *published* packages is
a coordinated major (0.3.0) that ripples to `cyoda-dev-console` and the other
downstream consumers per `CLAUDE.md`. After this baseline lands and 0.3.0 is
cut, dev-console must be validated/updated against the new majors. Tracked as a
separate follow-up; out of scope for execution in this spec.

## Testing

- Per-layer gate: `pnpm typecheck && pnpm build && pnpm test` (and `pnpm lint`
  from Layer 4). No layer lands red.
- Security gate: `pnpm audit` reports 0 advisories, or a documented residual
  with justification.
- The CI `validate` and `Release Preflight` workflows must pass on `staging`
  after every pushed layer.
- The private `@cyoda/docs-embed-demo` has one pre-existing failing test
  (`embedViewerPage` — reproduces on baseline, not in CI); it is out of scope
  and explicitly not a gate, but must not regress further.

## Success Criteria

- Every direct dependency is exact-pinned; all shared versions resolve from a
  single pnpm catalog entry.
- pnpm 10 in use with a 14-day `minimumReleaseAge` cooldown and an explicit
  `onlyBuiltDependencies` allowlist; all GitHub Actions SHA-pinned; registry
  pinned; provenance on.
- `pnpm audit` clean (or documented residual).
- typecheck + build + test + lint green across all packages.
- Dependabot configured to deliver grouped, cooldown-respecting, incremental
  updates going forward.
