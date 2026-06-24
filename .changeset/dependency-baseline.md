---
"@cyoda/workflow-core": minor
"@cyoda/workflow-monaco": minor
"@cyoda/workflow-react": minor
"@cyoda/workflow-viewer": minor
---

Dependency baseline: React 19, zod 4, and Monaco 0.55 support.

The toolchain and runtime dependencies were brought to a current, pinned
baseline. The consumer-facing changes are:

- **React 19 support.** `react`/`react-dom` peer ranges widened to
  `^18.3.1 || ^19.0.0` in `@cyoda/workflow-react`, `@cyoda/workflow-viewer`, and
  `@cyoda/workflow-monaco` — React 18 consumers are unaffected; React 19 is now
  supported.
- **zod 4.** `@cyoda/workflow-core` and `@cyoda/workflow-monaco` now build on
  zod 4. Consumers that import the exported zod schemas (e.g. `CriterionSchema`,
  `ImportPayloadSchema`) must be on zod 4. JSON-schema generation switched to
  zod 4's native `z.toJSONSchema`.
- **Monaco 0.55.** `@cyoda/workflow-monaco`'s `monaco-editor` peer is now
  `>=0.45 <0.56`.

Internal build/test tooling (Vite 8, Vitest 4, ESLint 10, TypeScript 6, etc.)
was also updated; those are dev-only and do not affect the published packages'
runtime.

(Pre-1.0 `minor` per the 0.x convention — the project is intentionally staying
in 0.x.)
