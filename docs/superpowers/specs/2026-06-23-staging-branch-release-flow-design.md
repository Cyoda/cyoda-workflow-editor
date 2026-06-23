# Design: Long-lived `staging` branch for the release flow

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Author:** Paul Schleger (with Claude)

## Problem

All changes intended for the next `0.3.0` release currently sit on the ad-hoc,
shared branch `editor-improvements-vs`. We want a durable, intentional release
process:

- A **permanent staging branch** where all further feature work, fixes, and
  Dependabot PRs accumulate and are continuously validated by CI.
- Dependabot PRs targeting that staging branch instead of `main`.
- GitHub workflows that run proper CI + release preflight on the staging branch,
  while keeping `main` as the single source of truth for published versions.

This must stay consistent with the repository's release contract in
[`ai/npm-release-mechanism.md`](../../../ai/npm-release-mechanism.md). In
particular: **CI is the only publisher**, **publish happens from `main`**,
**Changesets is the version authority**, **private packages never publish**, and
**release branches are stabilization bundles, not the version authority**.

## Decisions (settled during brainstorming)

1. **Publish source:** Stable `0.3.0` (and every future release) publishes to npm
   `@latest` **only from `main`**. The staging branch never publishes.
2. **Staging branch behavior:** CI + preflight (typecheck/build/test +
   `changeset status` + publish dry-run) only. **No npm publish** from the
   staging branch — no `@next`/`@rc` versions are pushed for now.
3. **Branch model:** One **permanent, long-lived** staging branch named
   **`staging`** (chosen over `next` to avoid confusion with the npm `next`
   dist-tag if RC publishing is enabled later). Dependabot target and workflow
   branch filters are set once and do not change per release cycle.
4. **Manual release trigger (`release.yml`):** **Option B** — keep a
   `workflow_dispatch` entry point, but have it run the **Changesets action
   against `main`** (a safe manual "kick the release"), replacing the existing
   `manual-branch-publish` job that raw-published whatever branch it was
   dispatched from. This preserves the doc's blessed `workflow_dispatch`
   bootstrap/fallback while removing the "publish an arbitrary branch" footgun.

## Branch topology

```
feature/* + dependabot/* ──PR──▶ staging      (CI + preflight; never publishes)
                                    │ when a release is ready:
                                    │ merge commit (NOT squash)
                                    ▼
                                  main         (changesets action → "Version Packages" PR
                                                → merge → publish changed packages @latest)
```

- **`main`** — protected trunk; the only branch that publishes to npm. Role
  unchanged.
- **`staging`** — new permanent branch. All feature work, fixes, and Dependabot
  PRs land here via PR. Continuously validated; never publishes.
- **`staging → main`** integration uses a **merge commit, not squash**, so the
  individual commits and — critically — the `.changeset/*.md` files ride the
  merge into `main`, where the Changesets action consumes them.

### Bootstrapping `staging`

- Cut `staging` from the **current `editor-improvements-vs` HEAD**, which already
  equals `main` @ 0.2.0 plus all the 0.3.0 work (the earlier `git merge origin/main`).
- Push `staging` and make it the new integration target.
- **Retire `editor-improvements-vs` only after coordinating with collaborators**
  (Victoria, Patrick): they re-point their in-flight work onto `staging`. Do not
  force-rewrite or delete shared history unilaterally.

## Release flow (publish mechanism unchanged)

Changesets remains the source of truth and `baseBranch` stays `main`.

1. PRs into `staging` each carry their `.changeset/*.md` entries (per the existing
   day-to-day flow in the release doc).
2. `staging` only **accumulates** changesets. `changeset version` is **never** run
   on `staging`; preflight runs `changeset status` against `main`.
3. When a release is ready, open a PR `staging → main` and merge it as a **merge
   commit**.
4. On push to `main`, the existing `release.yml` `main-release` job runs the
   Changesets action, which opens/updates the **"Version Packages"** PR.
5. Merging the Version Packages PR triggers `release.yml` again, and CI publishes
   the changed public packages to `@latest`.

No change to the `main` publish path or to `.changeset/config.json`.

## Workflow file changes (small, additive)

### `.github/dependabot.yml`
Add `target-branch: "staging"` to **both** ecosystem entries (`npm` and
`github-actions`). Effect: all Dependabot PRs — including the current security
updates (6 open advisories: 2 critical / 1 high / 2 moderate / 1 low) — open
against `staging` rather than `main`. Dependency updates reach `main` via the
`staging → main` release merges.

### `.github/workflows/ci.yml`
- Scope the `push` trigger to `branches: [main, staging]` (currently bare `push:`
  fires on every branch). This stops duplicate CI runs (push + pull_request both
  firing) on PR branches while still covering both long-lived branches.
- `pull_request:` stays as-is, so PRs into `staging` and `main` are validated.

### `.github/workflows/release-preflight.yml`
- Add `staging` to `push.branches` (alongside the existing `release/**`).
- Add `staging` to `pull_request.branches`.
- Extend the job `if:` guard so preflight also runs for `staging` pushes and for
  PRs whose head or base is `staging` (currently it only allows `release/`
  prefixes). Keep the existing `release/**` support intact.

### `.github/workflows/release.yml`
- **`main-release` job (push to `main`):** unchanged.
- **Replace the `manual-branch-publish` job** with a `workflow_dispatch` path
  (Option B) that:
  - runs the **Changesets action against `main`** (same logic as the push job:
    open/update the Version Packages PR, or publish if it was just merged), and
  - is **guarded so it only operates when the dispatched ref is `main`** (e.g.
    `if: github.ref == 'refs/heads/main'`), so a manual run can never
    raw-publish an arbitrary branch.
- Net effect: a safe manual "kick the release" fallback the doc explicitly
  blesses, with the arbitrary-branch publish footgun removed.

## Branch protection (GitHub settings — not files)

Recommended deploy step, applied via `gh api` or the GitHub UI (out of scope for
the in-repo file diff, listed here for completeness):

- Require **CI** and **Release Preflight** to pass on both `main` and `staging`.
- Require PRs (no direct pushes) into `main` and `staging`.

## Out of scope (YAGNI)

- **RC / prerelease publishing** (`@next` / `@rc` dist-tags, `changeset pre
  enter/exit`). Tooling exists (`prerelease:enter`/`prerelease:exit`) but stays
  unused under decision #2. Revisit if external pre-release testing is needed —
  and reconsider the `staging` vs `next` name at that point.
- **Version-pinned release branches** (`release/v0.3.0`, recreated per cycle).
  Rejected in favor of the permanent `staging` branch to avoid per-cycle
  Dependabot retargeting and branch-name churn. The existing `release/**`
  preflight support is left in place for occasional ad-hoc stabilization bundles.

## Acceptance criteria

- A permanent `staging` branch exists on the remote, cut from the current 0.3.0
  work, and is the documented integration target.
- `dependabot.yml` opens PRs against `staging` for both ecosystems.
- `ci.yml` runs on pushes to `main`/`staging` and on PRs, with no duplicate
  push+PR runs.
- `release-preflight.yml` runs on `staging` pushes and PRs into `staging`, while
  retaining `release/**` and `main` PR coverage.
- `release.yml` still publishes only from `main`; the `workflow_dispatch` path
  runs the Changesets action against `main` only and cannot publish other
  branches.
- `main`'s publish path and `.changeset/config.json` (`baseBranch: main`) are
  unchanged; a `staging → main` merge commit still drives the normal
  Version-Packages-PR → publish flow.
- `ai/npm-release-mechanism.md` is updated to document the permanent `staging`
  branch as the standard integration target (its invariants remain satisfied).
