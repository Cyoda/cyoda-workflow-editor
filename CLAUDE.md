# Repository Pointer

This repository is the monorepo for `@cyoda/workflow-core` and sibling packages powering workflow editing in `cyoda-dev-console`.

Before touching dialect files, `SUPPORTED_CYODA_VERSIONS`, `LATEST_CYODA_VERSION`, `parseImportPayload`, or `serializeImportPayload`, read [ai/cyoda-schema-versions.md](ai/cyoda-schema-versions.md).

Before touching release workflows, Changesets config, or package publish metadata, read [ai/npm-release-mechanism.md](ai/npm-release-mechanism.md).

The canonical model, `WorkflowEditorDocument`, is defined in `workflow-core`. Changing it is a **major-class** change: it requires coordinated updates across all five downstream packages plus `cyoda-dev-console`.

**Versioning policy — the project deliberately stays in `0.x`.** While below `1.0.0`, breaking and major-class changes (including canonical-model changes) ship as a Changesets **`minor`**, per the 0.x semver convention — **not** as a `major`/`1.0.0` cut. Reserve `major` (`1.0.0`) for an explicit, intentional API-stability commitment; never cut it just because a change is breaking or touches the canonical model. Where other docs say "major bump" for such changes, read it as this major-*class* tier that ships as a 0.x `minor`. This convention is documented in the package CHANGELOGs (see the "Pre-1.0 `minor` per the 0.x convention" notes in `packages/workflow-core/CHANGELOG.md`).

Do not rewrite or duplicate what `cyoda-workflow-editor` packages provide in the dev-console.
