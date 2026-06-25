import { ImportPayloadSchema } from "@cyoda/workflow-core";
import * as z from "zod";
import type { JsonSchemaHandle, MonacoLike } from "./types.js";

export const WORKFLOW_SCHEMA_URI = "https://cyoda.dev/schemas/workflow-import.schema.json";

/**
 * JSON Schema generated from the Zod `ImportPayloadSchema` (spec §18.4).
 * Uses zod 4's native `z.toJSONSchema()` with the draft-7 target, which Monaco's
 * JSON language service validates against. This avoids `zod-to-json-schema` which
 * silently returns an empty definition when given a zod 4 schema at runtime.
 */
export function workflowJsonSchema(): object {
  return z.toJSONSchema(ImportPayloadSchema, { target: "draft-7" });
}

/**
 * Register the workflow JSON schema with Monaco's JSON language service
 * so in-editor autocomplete + schema validation light up on any URI that
 * starts with `cyoda://workflow/`.
 *
 * Returns a handle for unregistering on unmount.
 */
export function registerWorkflowSchema(
  monaco: MonacoLike,
  opts: { fileMatchPrefix?: string; schemaUri?: string } = {},
): JsonSchemaHandle {
  const fileMatchPrefix = opts.fileMatchPrefix ?? "cyoda://workflow/";
  const schemaUri = opts.schemaUri ?? WORKFLOW_SCHEMA_URI;
  const schema = workflowJsonSchema();

  const existing = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas ?? [];
  const kept = existing.filter((s) => s.uri !== schemaUri);
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    ...monaco.languages.json.jsonDefaults.diagnosticsOptions,
    validate: true,
    allowComments: false,
    schemas: [
      ...kept,
      {
        uri: schemaUri,
        fileMatch: [`${fileMatchPrefix}*`],
        schema,
      },
    ],
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
