Changesets release mechanism for the Cyoda Workflow Editor monorepo

A recipe for shipping the Cyoda Workflow Editor TypeScript/pnpm workspace monorepo to npm using the same discipline we use for Go releases:

* CI is the only publisher
* No manual npm publish from laptops
* Release branches are optional but supported
* Pre-release candidates are first-class
* Changesets is the source of truth for what gets versioned and published
* Git tags are outputs of a release, not the thing that decides package versions

This is the correct model for the Cyoda Workflow Editor repository because it has multiple publishable packages:

* @cyoda/workflow-core
* @cyoda/workflow-graph
* @cyoda/workflow-layout
* @cyoda/workflow-monaco
* @cyoda/workflow-react
* @cyoda/workflow-viewer

and two non-publishable packages that must remain private:

* cyoda-workflow-editor (root)
* @cyoda/docs-embed-demo

⸻

Goals

* Changesets are the source of truth. Each change intended to affect a published package carries a .changeset/*.md entry that says which packages bump and why.
* Only CI publishes. No npm publish from developer machines.
* Stable and prerelease releases are both supported.
* Release branches can isolate a release bundle when needed.
* Preflight checks gate the release PR / release branch.
* Provenance by default. npm attestations via GitHub Actions OIDC; temporary NPM_TOKEN only for bootstrap if unavoidable.
* Multi-package correctness. Only changed public packages version and publish; private workspace packages never publish.

⸻

Pieces

Piece	Responsibility
.changeset/*.md	Declares which publishable packages change and what semver bump they need
.github/workflows/ci.yml	Runs install, typecheck, build, test on pushes/PRs
.github/workflows/release-preflight.yml	Validates release readiness on release PRs or release branches
.github/workflows/release.yml	Runs Changesets release flow in CI and publishes to npm
.changeset/config.json	Controls Changesets behaviour for the monorepo
package.json files in each publishable package	Package metadata, exports, files, license, access
npm dist-tags	latest for stable; next / rc / beta / alpha for prereleases
GitHub Release / tags	Release record after publish; not the mechanism for package version calculation

⸻

Invariants

Lock these in:

* Never publish from a developer laptop.
* Never force-move a release tag.
* Private packages stay private.
* Changesets determine package versions.
* CI is the only thing allowed to publish.
* OIDC trusted publishing is preferred.
* If NPM_TOKEN is used at all, it is only for bootstrap and should be removed once trusted publishing is configured per package.

⸻

What changes from the single-package model

The original doc assumes:

* one package
* one root package.json version
* one tag like v1.2.3
* tag must match root package version

That is wrong for the Cyoda Workflow Editor repository.

In this monorepo:

* there are multiple package versions
* several packages may publish in one release
* some releases affect only one or two packages
* the root package is private and must not drive published versioning

So for Cyoda Workflow Editor:

* do not use “tag must equal root package version”
* do not use root package.json as the authoritative published version
* do use Changesets to generate the package version bumps
* do let CI publish only the changed publishable packages

⸻

Package boundaries

Publishable

* @cyoda/workflow-core
* @cyoda/workflow-graph
* @cyoda/workflow-layout
* @cyoda/workflow-monaco
* @cyoda/workflow-react
* @cyoda/workflow-viewer

Never published

* cyoda-workflow-editor
* @cyoda/docs-embed-demo

These must remain "private": true.

⸻

Day-to-day development flow

For every PR that changes a publishable package:

1. Make the code change.
2. Add a changeset:

pnpm changeset

3. Select the affected package(s).
4. Choose the semver bump:
    * patch for fixes
    * minor for backward-compatible features
    * major for breaking changes
5. Write a short human-readable summary.
6. Commit the .changeset/*.md file with the code.

If a PR only affects private/demo code or internal repo tooling and should not publish any package, no changeset is needed.

This becomes the release ledger for the monorepo.

⸻

Stable release procedure

Option A — simple flow from main

Use this most of the time.

1. Merge normal feature/fix PRs into main, each with their own changeset entries.
2. When you want to ship, open or update the Changesets release PR.
3. Review the generated version bumps and changelog entries.
4. Merge the release PR.
5. CI publishes the changed public packages to npm under latest.
6. CI optionally creates a Git tag and/or GitHub Release representing that release batch.

Option B — release branch flow

Use this when you want to bundle, stabilise, and test a release candidate.

1. Cut a release branch:

git checkout main && git pull
git checkout -b release/2026-04-cyoda-workflow-editor
git push -u origin release/2026-04-cyoda-workflow-editor

2. Target stabilization/fix PRs at the release branch.
3. Ensure every publishable change still carries a valid changeset.
4. Run release preflight on the release branch.
5. When ready, open a consolidating PR from release/... back to main.
6. Merge via merge commit, not squash, so the individual fix commits remain visible.
7. Let the Changesets release PR and CI publish from main.

This preserves the original document’s “release branch isolates the bundle” discipline, but the actual version bumping is still done by Changesets rather than by manually editing one package version.  ￼

⸻

Prerelease / RC flow

Changesets supports prerelease mode, which is the correct equivalent of the original v1.2.3-rc.1 model for a monorepo.

Enter prerelease mode

From the release branch or a dedicated stabilization branch:

pnpm changeset pre enter rc

This tells Changesets that the next release cycle should publish prerelease versions such as:

* @cyoda/workflow-core@0.4.0-rc.0
* @cyoda/workflow-react@0.4.0-rc.0

Then:

pnpm changeset version

Commit the resulting package version updates.

Publish prereleases

CI publishes those packages under a prerelease dist-tag, typically rc or next, not latest.

Consumers opt in explicitly, e.g.:

npm install @cyoda/workflow-core@rc

Leave prerelease mode

When the release candidate is accepted:

pnpm changeset pre exit
pnpm changeset version

Commit the final stable versions, merge to main, and let the release workflow publish to latest.

This is the correct monorepo replacement for the original “tag v1.2.3-rc.1, then later tag v1.2.3” flow.  ￼

⸻

Release workflow

For Cyoda Workflow Editor, the release workflow should be Changesets-driven, not “root tag matches root package version”.

Recommended trigger

Use one of these:

Preferred

Run on push to main and let the Changesets action either:

* open/update a version PR, or
* publish if the version PR has just been merged

Acceptable alternative

Manual trigger via workflow_dispatch while bootstrapping

Workflow responsibilities

The release workflow should:

1. check out the repo
2. install dependencies with pnpm
3. build and test
4. run Changesets action
5. if there are pending changesets:
    * create/update a Version Packages PR
6. if versions have just been merged and packages are ready:
    * publish changed public packages
7. optionally create a GitHub Release and/or annotated tag for the release batch

It must not

* publish the root package
* publish the demo app
* require a single root version/tag match
* assume all packages always release together

⸻

Preflight checks

Keep preflight. It is useful.

For Cyoda Workflow Editor, preflight should validate:

* CI passes for the whole workspace
* all changed public packages have valid package metadata
* pnpm pack / publish dry-run succeeds for affected public packages
* private packages are not accidentally publishable
* no package version already exists on npm for the versions about to be released
* changelog/release notes generation looks sane
* prerelease mode state is correct if doing an RC

This is the monorepo equivalent of the original document’s “duplicate version, dry-run publish, changelog” checks.  ￼

⸻

Tags and GitHub Releases

For this repo, tags are release markers, not the package version source of truth.

Recommended rule:

* after a successful publish batch, CI may create a Git tag such as:
    * release-2026-04-24
    * or monorepo-release-2026-04-24-1
* or you can create GitHub Releases without relying on semver tags at repo root

If you really want semver-like tags, use them to mark the release batch, not to drive the package versions. For example:

* cyoda-workflow-editor-release-2026.04.24

Do not pretend that one repo tag equals all package versions.

That is the main conceptual shift from the original doc.  ￼

⸻

Provenance and authentication

Preferred

Use OIDC trusted publishing per package on npm.

Bootstrap exception

Use NPM_TOKEN only to get the first publish through if the packages do not yet exist and trusted publisher UI is unavailable.

After first publish:

1. go to each package on npm
2. configure GitHub Actions trusted publisher
3. remove token-based publishing from the workflow

That preserves the “no long-lived publish secret” goal from the original doc, while acknowledging the first-publish bootstrap problem.  ￼

⸻

What to carry forward from the Go process

Go mechanism	Cyoda Workflow Editor monorepo equivalent
Release branches	Optional release/* branches for stabilization
Preflight checks	release-preflight.yml validating workspace release readiness
Signed tags	Optional release-batch tags signed by maintainer/CI
CI-only publishing	Same, mandatory
Smoke test candidate	pnpm pack + install published tarball/package into a fixture consumer
Prerelease candidates	Changesets prerelease mode + npm rc / next dist-tags
GitHub Release notes	Generated from release PR / published batch

⸻

First release checklist for Cyoda Workflow Editor

* CI passes on main
* All six publishable packages have correct name, files, main, exports, types, license, publishConfig.access
* Root package is private
* Docs demo package is private
* .changeset/config.json is correct
* At least one valid .changeset/*.md entry exists for the packages you want to publish
* release.yml is Changesets-aware
* release-preflight.yml is committed
* pnpm pack / publish dry-run succeeds for affected packages
* NPM_TOKEN exists only if still needed for bootstrap
* npm trusted publishers configured after first successful publish
* no manual npm publish from any laptop
* .nvmrc or equivalent pins Node version
* prerelease flow tested if you want RCs before stable

⸻

Operational rules for the team and for AI coding agents

Add these to the repo guidance:

* Never bypass Changesets for publishable package changes.
* Never publish from a laptop.
* Never make the root package the published version authority.
* Never make private packages publishable.
* Never replace the monorepo release flow with a single-package root-tag model.
* If changing release workflows, preserve:
    * CI-only publishing
    * prerelease support
    * public package filtering
    * provenance
    * preflight validation

⸻

Recommended release policy for this repo

For Cyoda Workflow Editor, this is the cleanest practical policy:

1. normal PRs land on main with changesets
2. Changesets action maintains a version PR
3. merge the version PR when ready
4. CI publishes changed public packages
5. use prerelease mode when you want RCs
6. use release branches only when you need consolidation/stabilization
7. use tags/releases as markers, not as the version authority

⸻

Permanent staging branch (standard integration target)

This repo uses a permanent, long-lived `staging` branch as the standard
integration target. It refines the policy above:

* All feature/fix PRs and all Dependabot PRs target `staging`, not `main`.
* `staging` runs CI and release preflight on every push and PR, but never
  publishes to npm and never runs `changeset version`. It only accumulates
  `.changeset/*.md` entries.
* To cut a release, open a PR `staging → main` and merge it as a merge commit
  (not squash), so the changeset files reach `main`.
* On `main`, the Changesets action opens/updates the "Version Packages" PR;
  merging it publishes the changed public packages to `latest`. `main` remains
  the only publisher.
* `dependabot.yml` carries `target-branch: "staging"`. Note Dependabot reads this
  file only from the default branch (`main`).
* `release.yml`'s `workflow_dispatch` runs the Changesets action against `main`
  only — it is a safe manual fallback, never an arbitrary-branch publish.
* Version-pinned `release/*` branches remain supported for occasional ad-hoc
  stabilization bundles, but are not the day-to-day flow.

All original invariants still hold: CI-only publishing, publish-from-`main`,
Changesets as the version authority, private packages never publish.
