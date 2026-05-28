# Cyoda Workflow Editor Release Guide

Detailed release policy lives in
[`ai/npm-release-mechanism.md`](ai/npm-release-mechanism.md).

Quick rules:

- Changesets is authoritative for package versioning.
- CI is the only publisher.
- Do not run `npm publish` from a laptop.
- Stable releases normally flow through the Changesets version PR on `main`.
- Prereleases use Changesets prerelease mode, for example `pnpm prerelease:enter rc`.
- `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` stay private.

Security rules for the release pipeline:

- All third-party GitHub Actions in `release.yml` are pinned to full commit SHAs. Do not replace them with mutable version tags (`@v4`, `@v1`).
- When upgrading an action, obtain the new commit SHA via `git ls-remote https://github.com/<owner>/<repo>.git refs/tags/<version>` (use `refs/tags/<version>^{}` for annotated tags) and update both the SHA and the inline version comment.
- Current pinned versions: `actions/checkout` v4.3.1 · `pnpm/action-setup` v4.3.0 · `actions/setup-node` v4.4.0 · `changesets/action` v1.8.0.

Useful commands:

```sh
pnpm changeset
pnpm version-packages
pnpm prerelease:enter rc
pnpm prerelease:exit
pnpm release:preflight
```
