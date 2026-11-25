# Cyoda Workflow Editor Release Guide

Detailed release policy lives in
[`ai/npm-release-mechanism.md`](ai/npm-release-mechanism.md).

Quick rules:

- Changesets is authoritative for package versioning.
- CI is the only publisher. It only *stages* versions, and a maintainer approves them on npm before they go live.
- Do not run `npm publish` from a laptop.
- Stable releases normally flow through the Changesets version PR on `main`.
- Prereleases use Changesets prerelease mode, for example `pnpm prerelease:enter rc`.
- `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` stay private.

Release steps:

1. Feature and fix PRs, each with its changeset, merge into `staging`.
2. Open a `staging → main` PR and merge it as a **merge commit**. The Release workflow opens or updates the "Version packages" PR.
3. Review and merge the "Version packages" PR. The Release workflow stages each changed package on npm (`npm stage publish`, through OIDC trusted publishing, with provenance), then pushes the git tags and creates the GitHub releases.
4. **Approve the staged versions.** Until then they are not installable, and `npm view` still shows the previous version; that is expected. Approve them on npmjs.com, or with `npm stage list @cyoda/<pkg>` and then `npm stage approve <stage-id>`. Approval needs npm ≥ 11.21 (e.g. `npx -y npm@11.21.2 …`) and 2FA. The Release log prints each package's stage id.
5. Check the registry with `npm view @cyoda/<pkg> version`, allowing about 3 minutes for it to update. Then back-merge `main → staging` with a merge-commit PR, and bump downstream consumers such as `cyoda-dev-console`.

There is no npm token. Each package's trusted publisher on npmjs.com (repo `cyoda-workflow-editor`, workflow `release.yml`) has "Allow npm publish" and "Allow npm dist-tag" unchecked, so CI can stage versions but never put them live. Keep it that way, and keep `scripts/release-publish.mjs` on `npm stage publish`, because `changeset publish` is refused with `E403`. Details are in [`ai/npm-release-mechanism.md`](ai/npm-release-mechanism.md), under "Provenance and authentication".

Security rules for the release pipeline:

- All third-party GitHub Actions in `release.yml` are pinned to full commit SHAs. Do not replace them with mutable version tags (`@v4`, `@v1`).
- When upgrading an action, obtain the new commit SHA via `git ls-remote https://github.com/<owner>/<repo>.git refs/tags/<version>` (use `refs/tags/<version>^{}` for annotated tags) and update both the SHA and the inline version comment.
- Current pinned versions: `actions/create-github-app-token` v3.2.0 · `actions/checkout` v7.0.0 · `pnpm/action-setup` v6.0.9 · `actions/setup-node` v6.4.0 · `changesets/action` v1.9.0. npm itself is pinned in the "Upgrade npm" step (currently 11.21.2).

Useful commands:

```sh
pnpm changeset
pnpm version-packages
pnpm prerelease:enter rc
pnpm prerelease:exit
pnpm release:preflight
```
