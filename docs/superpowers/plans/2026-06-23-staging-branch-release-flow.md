# Staging Branch Release Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a permanent `staging` integration branch that accumulates feature/fix/Dependabot work under CI + preflight, while `main` remains the only branch that publishes to npm.

**Architecture:** All day-to-day work and Dependabot PRs target a long-lived `staging` branch. `staging` runs CI + release preflight but never publishes. Releases happen by merging `staging → main` (merge commit), after which the existing Changesets action on `main` opens the "Version Packages" PR and publishes. Workflow/config edits are authored once on a branch off `main`, merged to `main` (so the parts that must live on the default/base branch are active immediately), then merged into `staging`.

**Tech Stack:** GitHub Actions (YAML), Dependabot, Changesets, pnpm workspace, `actionlint` (workflow linter), `gh` CLI.

## Global Constraints

Copied verbatim from the spec / `ai/npm-release-mechanism.md`. Every task's requirements implicitly include these:

- **CI is the only publisher. Publish happens only from `main`.** Never publish from a developer laptop or an arbitrary branch.
- **Changesets is the version authority.** `.changeset/config.json` keeps `baseBranch: main`. Never run `changeset version` on `staging`; `staging` only *accumulates* `.changeset/*.md`.
- **Private packages never publish.** Root `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` stay `"private": true`.
- **`staging → main` integration uses a merge commit, NOT squash**, so `.changeset/*.md` files and individual commits reach `main`.
- **Dependabot reads `dependabot.yml` only from the default branch (`main`).** A `target-branch` change has no effect until it is on `main`.
- **`pull_request` workflows execute from the *base* branch's copy of the workflow.** Preflight must exist on both `main` (to gate `staging → main` PRs) and `staging` (to gate `feature → staging` PRs).
- **Branch `staging` must exist before `dependabot.yml` references it**, or Dependabot errors.
- **Preserve in any release-workflow change:** CI-only publishing, prerelease support, public-package filtering, provenance, preflight validation.

**Note on TDD adaptation:** These tasks edit static YAML/Markdown and orchestrate git/GitHub, which have no unit tests. The "test" in each task is an explicit verification command (`actionlint`, a YAML parse, a `grep`/`git`/`gh` assertion) run after the edit, plus a pre-edit state check. Cadence stays bite-sized and independently verifiable.

---

## File Structure

| File | Responsibility | Lands on |
|---|---|---|
| `.github/dependabot.yml` | Route Dependabot PRs to `staging` | `main` (via PR) + `staging` (via merge) |
| `.github/workflows/ci.yml` | Typecheck/build/test; scoped push triggers | both branches |
| `.github/workflows/release-preflight.yml` | Release-readiness gate on `staging` pushes + PRs into `staging`/`main` | both branches (PR base governs) |
| `.github/workflows/release.yml` | Publish from `main`; safe manual trigger (Option B) | `main` (governs releases) + `staging` |
| `ai/npm-release-mechanism.md` | Document `staging` as the standard integration target | both branches |

All five edits are authored on one branch off `main` (`chore/staging-release-flow`), merged to `main`, then merged into `staging`. Authoring once and converging via merge avoids drift and merge conflicts (each file is edited on a single source branch).

---

### Task 1: Create and push the permanent `staging` branch

**Files:** none (git branch operation)

**Interfaces:**
- Produces: remote branch `origin/staging` at the current `0.3.0` work tip (current `editor-improvements-vs` HEAD, which already includes `main` @ 0.2.0 + the design-doc commit `f0847b3`).

- [ ] **Step 1: Confirm current HEAD is the intended 0.3.0 tip**

Run:
```bash
git rev-parse --abbrev-ref HEAD && git log --oneline -1
```
Expected: branch `editor-improvements-vs`, top commit `f0847b3 docs: design for long-lived staging branch release flow`.

- [ ] **Step 2: Create `staging` from current HEAD**

Run:
```bash
git branch staging
```

- [ ] **Step 3: Push `staging` and set upstream**

Run:
```bash
git push -u origin staging
```

- [ ] **Step 4: Verify `staging` exists on the remote at the expected SHA**

Run:
```bash
git ls-remote --heads origin staging
git rev-parse staging editor-improvements-vs
```
Expected: `ls-remote` lists `refs/heads/staging`; both local refs resolve to the same SHA.

No commit (branch creation only).

---

### Task 2: Author all config/workflow edits on a branch off `main`

This task creates the authoring branch and is the parent for Tasks 3–7 (each a separate file + commit). Split from its children because a reviewer gates each file edit independently.

**Files:** none yet (branch setup)

**Interfaces:**
- Produces: local branch `chore/staging-release-flow` based on `origin/main`.

- [ ] **Step 1: Fetch and branch off the latest `main`**

Run:
```bash
git fetch origin
git switch -c chore/staging-release-flow origin/main
```

- [ ] **Step 2: Verify the branch base**

Run:
```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -1 origin/main
```
Expected: HEAD is `chore/staging-release-flow`; its tip equals `origin/main`'s tip.

No commit.

---

### Task 3: Route Dependabot PRs to `staging`

**Files:**
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: branch `chore/staging-release-flow` (Task 2); remote branch `staging` (Task 1, required to exist).
- Produces: a commit adding `target-branch: "staging"` to both ecosystem entries.

- [ ] **Step 1: Confirm current content (no `target-branch` yet)**

Run:
```bash
grep -n "target-branch" .github/dependabot.yml || echo "no target-branch (expected)"
```
Expected: `no target-branch (expected)`.

- [ ] **Step 2: Edit `.github/dependabot.yml` to its full new content**

Replace the whole file with:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    target-branch: "staging"
    schedule:
      interval: weekly

  - package-ecosystem: github-actions
    directory: /
    target-branch: "staging"
    schedule:
      interval: weekly
```

- [ ] **Step 3: Verify it is valid YAML and both entries target `staging`**

Run:
```bash
python3 -c "import yaml; d=yaml.safe_load(open('.github/dependabot.yml')); tgs=[u.get('target-branch') for u in d['updates']]; assert tgs==['staging','staging'], tgs; print('ok', tgs)"
```
Expected: `ok ['staging', 'staging']`.

- [ ] **Step 4: Commit**

Run:
```bash
git add .github/dependabot.yml
git commit -m "chore(dependabot): target the staging branch for both ecosystems"
```

---

### Task 4: Scope CI triggers and cover `staging`

**Files:**
- Modify: `.github/workflows/ci.yml` (the `on:` block, lines 3-5)

**Interfaces:**
- Consumes: branch `chore/staging-release-flow`.
- Produces: a commit scoping `push` to `[main, staging]` while keeping `pull_request` open.

- [ ] **Step 1: Confirm current trigger block**

Run:
```bash
sed -n '3,5p' .github/workflows/ci.yml
```
Expected:
```
on:
  push:
  pull_request:
```

- [ ] **Step 2: Edit the `on:` block**

Replace:
```yaml
on:
  push:
  pull_request:
```
with:
```yaml
on:
  push:
    branches:
      - main
      - staging
  pull_request:
```

- [ ] **Step 3: Lint the workflow**

Run:
```bash
actionlint .github/workflows/ci.yml
```
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "ci: scope push triggers to main and staging"
```

---

### Task 5: Extend release preflight to the `staging` branch

**Files:**
- Modify: `.github/workflows/release-preflight.yml` (the `on:` block lines 3-11 and the job `if:` guard line 18)

**Interfaces:**
- Consumes: branch `chore/staging-release-flow`.
- Produces: a commit that runs preflight on `staging` pushes, on PRs into `staging`, and on `staging → main` PRs, while retaining `release/**` support.

- [ ] **Step 1: Confirm current triggers and guard**

Run:
```bash
sed -n '3,18p' .github/workflows/release-preflight.yml
```
Expected: `push.branches` = `release/**` only; `pull_request.branches` = `main`, `release/**`; guard references only `release/` prefixes.

- [ ] **Step 2: Replace the `on:` block**

Replace:
```yaml
on:
  push:
    branches:
      - release/**
  pull_request:
    branches:
      - main
      - release/**
  workflow_dispatch:
```
with:
```yaml
on:
  push:
    branches:
      - staging
      - release/**
  pull_request:
    branches:
      - main
      - staging
      - release/**
  workflow_dispatch:
```

- [ ] **Step 3: Replace the job `if:` guard**

Replace:
```yaml
    if: github.event_name != 'pull_request' || startsWith(github.head_ref, 'release/') || startsWith(github.base_ref, 'release/')
```
with:
```yaml
    if: >-
      github.event_name != 'pull_request'
      || github.head_ref == 'staging'
      || github.base_ref == 'staging'
      || startsWith(github.head_ref, 'release/')
      || startsWith(github.base_ref, 'release/')
```

Rationale: a `staging → main` PR has `head_ref == 'staging'` (base is `main`), so the `head_ref == 'staging'` clause makes preflight run on the release PR; a `feature → staging` PR has `base_ref == 'staging'`.

- [ ] **Step 4: Lint the workflow**

Run:
```bash
actionlint .github/workflows/release-preflight.yml
```
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

Run:
```bash
git add .github/workflows/release-preflight.yml
git commit -m "ci(preflight): run on staging pushes and staging PRs"
```

---

### Task 6: Make the manual release trigger safe (Option B)

**Files:**
- Modify: `.github/workflows/release.yml` (the `main-release` job guard, and delete the `manual-branch-publish` job at lines 60-93)

**Interfaces:**
- Consumes: branch `chore/staging-release-flow`.
- Produces: a commit where `workflow_dispatch` runs the Changesets action against `main` only, and the arbitrary-branch publish job is removed.

- [ ] **Step 1: Confirm the current guard and the job to remove**

Run:
```bash
grep -n "if: github.event_name == 'push'" .github/workflows/release.yml
grep -n "manual-branch-publish" .github/workflows/release.yml
```
Expected: the `push`-only guard appears on the `main-release` job; `manual-branch-publish:` appears at line 60.

- [ ] **Step 2: Replace the `main-release` guard so it covers push-to-main and dispatch-on-main**

Replace:
```yaml
  main-release:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
```
with:
```yaml
  main-release:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
```

Rationale: `on.push.branches` is already `[main]`, so a push event always has `github.ref == 'refs/heads/main'`; a `workflow_dispatch` carries the dispatched ref, so dispatching from `main` runs the Changesets action (open/update Version Packages PR, or publish if it was just merged) and dispatching from any other branch is skipped. This preserves the doc-blessed manual fallback without the arbitrary-branch publish.

- [ ] **Step 3: Delete the entire `manual-branch-publish` job**

Remove the block beginning at:
```yaml
  manual-branch-publish:
    if: github.event_name == 'workflow_dispatch'
```
through the end of that job (its final lines):
```yaml
      - name: Publish current branch state
        run: pnpm release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
Also remove the blank line that separated it from `main-release` so the file ends cleanly with the `main-release` job. Leave the `on: ... workflow_dispatch:` trigger (line 7) in place — it now feeds the guarded `main-release` job.

- [ ] **Step 4: Verify only one job remains and it is `main-release`**

Run:
```bash
grep -nE "^  [a-z-]+:" .github/workflows/release.yml
grep -c "manual-branch-publish" .github/workflows/release.yml
```
Expected: the first command lists `main-release:` (and no `manual-branch-publish:`); the second prints `0`.

- [ ] **Step 5: Lint the workflow**

Run:
```bash
actionlint .github/workflows/release.yml
```
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

Run:
```bash
git add .github/workflows/release.yml
git commit -m "ci(release): run manual dispatch via Changesets on main only; drop branch publish"
```

---

### Task 7: Document the permanent `staging` branch in the release doc

**Files:**
- Modify: `ai/npm-release-mechanism.md` (the "Recommended release policy for this repo" section near the end, currently lines ~365-376)

**Interfaces:**
- Consumes: branch `chore/staging-release-flow`.
- Produces: a commit recording `staging` as the standard integration target.

- [ ] **Step 1: Confirm the current closing policy list**

Run:
```bash
grep -n "Recommended release policy for this repo" ai/npm-release-mechanism.md
```
Expected: one match near the end of the file.

- [ ] **Step 2: Insert a `staging`-branch subsection immediately after the "Recommended release policy for this repo" numbered list**

Append this block after the existing numbered list (after the line "7. use tags/releases as markers, not as the version authority"):
```markdown

## Permanent staging branch (standard integration target)

This repo uses a permanent, long-lived `staging` branch as the standard
integration target. It refines the policy above:

* All feature/fix PRs and all Dependabot PRs target `staging`, not `main`.
* `staging` runs CI and release preflight on every push and PR, but never
  publishes to npm and never runs `changeset version`. It only accumulates
  `.changeset/*.md` entries.
* To cut a release, open a PR `staging → main` and merge it as a **merge commit**
  (not squash), so the changeset files reach `main`.
* On `main`, the Changesets action opens/updates the "Version Packages" PR;
  merging it publishes the changed public packages to `@latest`. `main` remains
  the only publisher.
* `dependabot.yml` carries `target-branch: "staging"`. Note Dependabot reads this
  file only from the default branch (`main`).
* `release.yml`'s `workflow_dispatch` runs the Changesets action against `main`
  only — it is a safe manual fallback, never an arbitrary-branch publish.
* Version-pinned `release/*` branches remain supported for occasional ad-hoc
  stabilization bundles, but are not the day-to-day flow.

All original invariants still hold: CI-only publishing, publish-from-`main`,
Changesets as the version authority, private packages never publish.
```

- [ ] **Step 3: Verify the section was added**

Run:
```bash
grep -n "Permanent staging branch (standard integration target)" ai/npm-release-mechanism.md
```
Expected: one match.

- [ ] **Step 4: Commit**

Run:
```bash
git add ai/npm-release-mechanism.md
git commit -m "docs: document permanent staging branch as integration target"
```

---

### Task 8: Land the infra on `main` via PR

**Files:** none (PR + merge)

**Interfaces:**
- Consumes: branch `chore/staging-release-flow` with Tasks 3-7 committed; remote `staging` (Task 1).
- Produces: the five edits merged into `main`, activating Dependabot retargeting, preflight gating, and Option B on `main`.

- [ ] **Step 1: Run the full preflight locally before pushing**

Run:
```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm build && pnpm test
pnpm release:preflight
```
Expected: all succeed (preflight prints changeset status + publish dry-run with no errors).

- [ ] **Step 2: Lint all workflows together**

Run:
```bash
actionlint
```
Expected: no output (exit 0).

- [ ] **Step 3: Push the branch and open the PR**

Run:
```bash
git push -u origin chore/staging-release-flow
gh pr create --base main --head chore/staging-release-flow \
  --title "chore: staging integration branch + release flow" \
  --body "Implements docs/superpowers/plans/2026-06-23-staging-branch-release-flow.md. Adds permanent staging branch flow: Dependabot targets staging, preflight covers staging, manual release dispatch is main-only (Option B). Publish path from main is unchanged."
```

- [ ] **Step 4: Wait for required checks, then merge as a merge commit**

Run:
```bash
gh pr checks --watch
gh pr merge --merge --delete-branch
```
Expected: checks pass; PR merges to `main`; remote `chore/staging-release-flow` deleted.

- [ ] **Step 5: Verify `main` now carries the changes**

Run:
```bash
git fetch origin
git show origin/main:.github/dependabot.yml | grep -c 'target-branch: "staging"'
git show origin/main:.github/workflows/release.yml | grep -c "manual-branch-publish"
```
Expected: first prints `2`; second prints `0`.

---

### Task 9: Merge the infra into `staging`

**Files:** none (merge)

**Interfaces:**
- Consumes: updated `origin/main` (Task 8); local/remote `staging` (Task 1).
- Produces: `staging` containing the new CI/preflight workflows that govern its own events.

- [ ] **Step 1: Update `staging` from `main`**

Run:
```bash
git fetch origin
git switch staging
git merge origin/main --no-edit
```
Expected: a clean merge commit (no conflicts — infra files were edited only on the `chore` branch).

- [ ] **Step 2: Verify `staging` carries the infra**

Run:
```bash
grep -c 'target-branch: "staging"' .github/dependabot.yml
grep -c "staging" .github/workflows/release-preflight.yml
actionlint
```
Expected: `2`; a non-zero count for preflight; `actionlint` exits 0.

- [ ] **Step 3: Push `staging`**

Run:
```bash
git push origin staging
```

- [ ] **Step 4: Confirm CI + preflight triggered on the `staging` push**

Run:
```bash
gh run list --branch staging --limit 5
```
Expected: recent `CI` and `Release Preflight` runs for `staging` (in progress or passed).

---

### Task 10: Configure branch protection on `main` and `staging`

**Files:** none (`gh api`, requires repo admin)

**Interfaces:**
- Consumes: passing CI (`validate`) and preflight (`preflight`) check names from a recent run.
- Produces: required-status-check + required-PR protection on both branches.

Note: requires admin rights on `Cyoda/cyoda-workflow-editor`. If the executing user lacks admin, skip and hand these commands to a maintainer. The check **context names** are the job names GitHub reports — confirm them before applying.

- [ ] **Step 1: Confirm the exact check names from a recent run**

Run:
```bash
gh api repos/Cyoda/cyoda-workflow-editor/commits/staging/check-runs --jq '.check_runs[].name' | sort -u
```
Expected: includes the CI job name (`validate`) and preflight job name (`preflight`). Use the exact strings returned in the next step.

- [ ] **Step 2: Apply protection to `main`**

Run (substitute confirmed check names if they differ):
```bash
gh api -X PUT repos/Cyoda/cyoda-workflow-editor/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["validate", "preflight"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
JSON
```
Expected: JSON response describing the protection (HTTP 200).

- [ ] **Step 3: Apply protection to `staging`**

Run:
```bash
gh api -X PUT repos/Cyoda/cyoda-workflow-editor/branches/staging/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["validate", "preflight"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null
}
JSON
```
Expected: JSON response (HTTP 200).

- [ ] **Step 4: Verify protection is active**

Run:
```bash
gh api repos/Cyoda/cyoda-workflow-editor/branches/main/protection --jq '.required_status_checks.contexts'
gh api repos/Cyoda/cyoda-workflow-editor/branches/staging/protection --jq '.required_status_checks.contexts'
```
Expected: both list `["validate","preflight"]` (or your confirmed names).

No commit (GitHub settings).

---

### Task 11: Coordinate and retire `editor-improvements-vs`

**Files:** none (coordination + git, gated on human confirmation)

**Interfaces:**
- Consumes: `staging` established as the integration target (Tasks 1, 9).
- Produces: collaborators moved to `staging`; the shared `editor-improvements-vs` branch retired.

This task is **manual and gated** — `editor-improvements-vs` is shared (Victoria, Patrick have commits on it). Do NOT delete it automatically.

- [ ] **Step 1: Confirm no unique commits would be lost**

Run:
```bash
git fetch origin
git log --oneline origin/editor-improvements-vs ^origin/staging
```
Expected: empty (every `editor-improvements-vs` commit is already contained in `staging`). If non-empty, stop and reconcile before retiring.

- [ ] **Step 2: Notify collaborators**

Tell Victoria and Patrick: `staging` is the new integration branch; re-point in-flight branches onto `staging` (`git rebase --onto origin/staging origin/editor-improvements-vs <their-branch>`), and open future PRs against `staging`. Get their acknowledgement before Step 3.

- [ ] **Step 3: Delete the retired remote branch (only after acknowledgement)**

Run:
```bash
git push origin --delete editor-improvements-vs
```
Expected: remote branch deleted.

- [ ] **Step 4: Verify**

Run:
```bash
git ls-remote --heads origin editor-improvements-vs
```
Expected: empty output (branch gone).

---

## Self-Review

**Spec coverage:**
- Permanent `staging` cut from current 0.3.0 work → Task 1. ✓
- Dependabot targets `staging` → Task 3 (+ active on `main` via Task 8). ✓
- CI on `main`/`staging`, no duplicate push+PR runs → Task 4. ✓
- Preflight on `staging` pushes + PRs into `staging`, retains `release/**`/`main` → Task 5. ✓
- `release.yml` publishes only from `main`; `workflow_dispatch` is `main`-only → Task 6. ✓
- `main` publish path + `baseBranch: main` unchanged → confirmed in Tasks 6/8 (no edits to publish steps or `config.json`). ✓
- `staging → main` via merge commit → enforced in doc (Task 7) and used in Task 9. ✓
- Update `ai/npm-release-mechanism.md` → Task 7. ✓
- Branch protection → Task 9/Task 10. ✓
- Retire `editor-improvements-vs` after coordination → Task 11. ✓

**Placeholder scan:** No TBD/TODO; every edit shows full content; every verification has an exact command + expected output.

**Type/name consistency:** Branch name `staging` and authoring branch `chore/staging-release-flow` used consistently; check contexts `validate`/`preflight` match the existing job names in `ci.yml` (`validate`) and `release-preflight.yml` (`preflight`); Option B guard `github.ref == 'refs/heads/main'` consistent between Task 6 and its rationale.

**Ordering correctness:** `staging` created (Task 1) before `dependabot.yml` references it; infra reaches `main` (Task 8) before it can govern `main`/release events; preflight lands on both branches (Tasks 8 + 9) per the "PR base branch governs" constraint.
