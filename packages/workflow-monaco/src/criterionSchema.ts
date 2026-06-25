import { CriterionSchema } from "@cyoda/workflow-core";
import * as z from "zod";
import type { JsonSchemaHandle, MonacoLike } from "./types.js";

export const CRITERION_SCHEMA_URI = "https://cyoda.dev/schemas/criterion.schema.json";

/**
 * JSON Schema for a single criterion, generated from the Zod `CriterionSchema`
 * (a recursive lazy union). zod 4's native `z.toJSONSchema` emits a root
 * `anyOf` with recursive `$ref:"#"` for nested groups / function prechecks.
 */
export function criterionJsonSchema(): object {
  return z.toJSONSchema(CriterionSchema, { target: "draft-7" });
}

/**
 * Register the criterion JSON schema with Monaco's JSON language service so
 * in-editor schema validation lights up on any URI under `cyoda://criterion/`.
 * Coexists with the workflow schema (distinct URI + fileMatch). Idempotent.
 */
export function registerCriterionSchema(
  monaco: MonacoLike,
  opts: { fileMatchPrefix?: string; schemaUri?: string } = {},
): JsonSchemaHandle {
  const fileMatchPrefix = opts.fileMatchPrefix ?? "cyoda://criterion/";
  const schemaUri = opts.schemaUri ?? CRITERION_SCHEMA_URI;
  const schema = criterionJsonSchema();

  const existing = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas ?? [];
  const kept = existing.filter((s) => s.uri !== schemaUri);
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    ...monaco.languages.json.jsonDefaults.diagnosticsOptions,
    validate: true,
    allowComments: false,
    schemas: [...kept, { uri: schemaUri, fileMatch: [`${fileMatchPrefix}*`], schema }],
  });

  return {
    schemaUri,
    fileMatchPrefix,
    dispose: () => {
      const current = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas ?? [];
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        ...monaco.languages.json.jsonDefaults.diagnosticsOptions,
        schemas: current.filter((s) => s.uri !== schemaUri),
      });
    },
  };
}
