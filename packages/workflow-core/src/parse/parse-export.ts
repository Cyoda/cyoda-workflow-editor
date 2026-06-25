import { getDialect, LATEST_CYODA_VERSION, type CyodaSchemaVersion } from "../dialect/index.js";
import { assignSyntheticIds } from "../identity/assign.js";
import { normalizeWorkflowInput } from "../normalize/input.js";
import { ExportPayloadSchema } from "../schema/payload.js";
import type { EditorMetadata, WorkflowEditorDocument } from "../types/editor.js";
import type { ExportPayload, WorkflowSession } from "../types/session.js";
import { validateSemantics } from "../validate/semantic.js";
import { zodErrorToIssues } from "../validate/schema.js";
import { ParseJsonError } from "./errors.js";
import type { ParseResult } from "./parse-import.js";

export function parseExportPayload(
  json: string,
  prior?: EditorMetadata,
  options?: { sourceVersion?: CyodaSchemaVersion },
): ParseResult<ExportPayload> {
  const sourceVersion = options?.sourceVersion ?? LATEST_CYODA_VERSION;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new ParseJsonError(`Invalid JSON: ${(e as Error).message}`);
  }

  let canonical: unknown;
  let warnings: string[];
  try {
    const result = getDialect(sourceVersion).toCanonical(parsed);
    canonical = result.value;
    warnings = result.warnings;
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: "operator-alias-conflict",
          message: (e as Error).message,
        },
      ],
    };
  }

  const schemaResult = ExportPayloadSchema.safeParse(canonical);
  if (!schemaResult.success) {
    return {
      ok: false,
      issues: zodErrorToIssues(schemaResult.error),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const normalizedWorkflows = schemaResult.data.workflows.map(normalizeWorkflowInput);
  const session: WorkflowSession = {
    entity: {
      entityName: schemaResult.data.entityName,
      modelVersion: schemaResult.data.modelVersion,
    },
    importMode: "MERGE",
    workflows: normalizedWorkflows,
  };

  const meta = assignSyntheticIds(session, prior);
  meta.cyodaVersion = sourceVersion;
  const document: WorkflowEditorDocument = { session, meta };

  const issues = validateSemantics(session, document);
  const hasError = issues.some((i) => i.severity === "error");

  return {
    ok: !hasError,
    value: {
      entityName: schemaResult.data.entityName,
      modelVersion: schemaResult.data.modelVersion,
      workflows: session.workflows,
    },
    document,
    issues,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
