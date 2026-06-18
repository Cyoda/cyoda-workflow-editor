# Repository Pointer

This repository is the monorepo for `@cyoda/workflow-core` and sibling packages powering workflow editing in `cyoda-dev-console`.

Before touching dialect files, `SUPPORTED_CYODA_VERSIONS`, `LATEST_CYODA_VERSION`, `parseImportPayload`, or `serializeImportPayload`, read [ai/cyoda-schema-versions.md](ai/cyoda-schema-versions.md).

Before touching release workflows, Changesets config, or package publish metadata, read [ai/npm-release-mechanism.md](ai/npm-release-mechanism.md).

The canonical model, `WorkflowEditorDocument`, is defined in `workflow-core`. Changes to it are major version bumps and require coordinated updates across all five downstream packages plus `cyoda-dev-console`.

Do not rewrite or duplicate what `cyoda-workflow-editor` packages provide in the dev-console.
