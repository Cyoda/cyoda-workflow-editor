import { getDialect, LATEST_CYODA_VERSION, type CyodaSchemaVersion } from "../dialect/index.js";
import { assignSyntheticIds } from "../identity/assign.js";
import { normalizeWorkflowInput } from "../normalize/input.js";
import { ImportPayloadSchema } from "../schema/payload.js";
import type { EditorMetadata, WorkflowEditorDocument } from "../types/editor.js";
import type { ImportPayload, WorkflowSession } from "../types/session.js";
import type { ValidationIssue } from "../types/validation.js";
import { validateSemantics } from "../validate/semantic.js";
import { zodErrorToIssues } from "../validate/schema.js";
import { ParseJsonError } from "./errors.js";

/** Maximum JSON string length accepted by the parser (5 MB). */
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

/**
 * Maximum JSON object/array nesting depth accepted before any recursive
 * processing begins. Prevents stack overflows in `normalizeOperatorAlias`,
 * Zod's recursive criterion schema, and downstream traversal helpers.
 */
export const MAX_JSON_OBJECT_DEPTH = 200;

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  document?: WorkflowEditorDocument;
  issues: ValidationIssue[];
}

function parseJsonSafe(json: string): { ok: true; value: unknown } | { ok: false; err: string } {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

/**
 * Iterative DFS that returns `true` when any node in the JSON tree is nested
 * more than `limit` levels deep. Never recurses — safe for any input depth.
 */
function exceedsObjectDepth(value: unknown, limit: number): boolean {
  const stack: { val: unknown; depth: number }[] = [{ val: value, depth: 1 }];
  while (stack.length > 0) {
    const { val, depth } = stack.pop()!;
    if (depth > limit) return true;
    if (typeof val !== "object" || val === null) continue;
    const children = Array.isArray(val) ? val : Object.values(val as Record<string, unknown>);
    for (const child of children) {
      if (typeof child === "object" && child !== null) {
        stack.push({ val: child, depth: depth + 1 });
      }
    }
  }
  return false;
}

/**
 * Parse a Cyoda import-payload JSON string into a WorkflowEditorDocument.
 * Pipeline: size guard → JSON.parse → depth guard → operator-alias normalisation
 * → Zod → input normalisation → assignSyntheticIds → semantic validation.
 */
export function parseImportPayload(
  json: string,
  prior?: EditorMetadata,
  options?: { sourceVersion?: CyodaSchemaVersion },
): ParseResult<ImportPayload> {
  const sourceVersion = options?.sourceVersion ?? LATEST_CYODA_VERSION;
  if (json.length > MAX_JSON_BYTES) {
    throw new ParseJsonError(
      `Workflow JSON exceeds the maximum allowed size of ${MAX_JSON_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const parsed = parseJsonSafe(json);
  if (!parsed.ok) {
    throw new ParseJsonError(`Invalid JSON: ${parsed.err}`);
  }

  if (exceedsObjectDepth(parsed.value, MAX_JSON_OBJECT_DEPTH)) {
    throw new ParseJsonError(
      `Workflow JSON nesting depth exceeds the maximum allowed depth of ${MAX_JSON_OBJECT_DEPTH}.`,
    );
  }

  let canonical: unknown;
  try {
    canonical = getDialect(sourceVersion).toCanonical(parsed.value);
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

  const schemaResult = ImportPayloadSchema.safeParse(canonical);
  if (!schemaResult.success) {
    return { ok: false, issues: zodErrorToIssues(schemaResult.error) };
  }

  const normalizedWorkflows = schemaResult.data.workflows.map(normalizeWorkflowInput);
  const session: WorkflowSession = {
    entity: null,
    importMode: schemaResult.data.importMode,
    workflows: normalizedWorkflows,
  };

  const meta = assignSyntheticIds(session, prior);
  meta.cyodaVersion = sourceVersion;
  const document: WorkflowEditorDocument = { session, meta };

  const issues = validateSemantics(session, document);
  const hasError = issues.some((i) => i.severity === "error");

  return {
    ok: !hasError,
    value: { importMode: session.importMode, workflows: session.workflows },
    document,
    issues,
  };
}
