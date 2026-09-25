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
  /**
   * Non-fatal notes from the dialect's `toCanonical` pass — e.g.
   * `processor-config-keys-dropped:<name>:<keys>` when the 0.8 dialect strips
   * a processor-config key cyoda-go doesn't recognise, or
   * `processor-keys-dropped:<name>:<keys>` for the same at processor level.
   * Additive: callers that do not read it are unaffected. Omitted when there
   * are no warnings.
   *
   * Every entry is ALSO mirrored into `issues` as an info-severity
   * `ValidationIssue` (see {@link dialectWarningToIssue}), which is how these
   * reach the user — `issues` is what the toolbar pills and the issues drawer
   * render. This raw array is kept because it is public API and consumers may
   * parse the machine-readable form.
   */
  warnings?: string[];
}

/**
 * Render a dialect `toCanonical` warning as an info-severity issue.
 *
 * The wire form is `<code>:<processor name>:<comma-separated keys>`. A
 * processor name is unconstrained at this point (it has not been through the
 * name regex yet) and may itself contain `:`, so the code is taken up to the
 * FIRST separator and the key list from the LAST one.
 */
export function dialectWarningToIssue(warning: string): ValidationIssue {
  const firstColon = warning.indexOf(":");
  const lastColon = warning.lastIndexOf(":");
  const code = firstColon === -1 ? warning : warning.slice(0, firstColon);
  const name = firstColon === lastColon ? "" : warning.slice(firstColon + 1, lastColon);
  const keys = firstColon === -1 ? "" : warning.slice(lastColon + 1);

  // The two codes below are spelled out as literals rather than passed through
  // from `code` so `tests/validate/rule-catalog.test.ts` can see them and hold
  // this file to the same documentation contract as the semantic rules.
  const detail = { processor: name, keys: keys.split(",").filter((k) => k.length > 0) };
  if (code === "processor-config-keys-dropped") {
    return {
      severity: "info",
      code: "processor-config-keys-dropped",
      message: `Processor "${name}": config keys not part of the cyoda-go wire format were dropped on import and will not be saved: ${keys}.`,
      detail,
    };
  }
  if (code === "processor-keys-dropped") {
    return {
      severity: "info",
      code: "processor-keys-dropped",
      message: `Processor "${name}": keys not part of the cyoda-go wire format were dropped on import and will not be saved: ${keys}.`,
      detail,
    };
  }
  if (code === "array-criterion-legacy-value") {
    return {
      severity: "warning",
      code: "array-criterion-legacy-value",
      message: `${keys} array criteria store their list under "value", which cyoda-go ignores — as stored, each of those guards matches every entity. The editor reads them correctly and writes "values" on save; save to fix the stored workflow.`,
      detail: { count: Number(keys) },
    };
  }
  // Unknown warning shape (a host-registered dialect may emit its own):
  // surface it verbatim rather than swallowing it.
  return { severity: "info", code: "dialect-warning", message: warning };
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
  let warnings: string[];
  try {
    const result = getDialect(sourceVersion).toCanonical(parsed.value);
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

  const warningIssues = warnings.map(dialectWarningToIssue);

  const schemaResult = ImportPayloadSchema.safeParse(canonical);
  if (!schemaResult.success) {
    return {
      ok: false,
      issues: [...zodErrorToIssues(schemaResult.error), ...warningIssues],
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const normalizedWorkflows = schemaResult.data.workflows.map(normalizeWorkflowInput);
  const session: WorkflowSession = {
    entity: null,
    importMode: schemaResult.data.importMode,
    ...(schemaResult.data.allowCycles !== undefined
      ? { allowCycles: schemaResult.data.allowCycles }
      : {}),
    workflows: normalizedWorkflows,
  };

  const meta = assignSyntheticIds(session, prior);
  meta.cyodaVersion = sourceVersion;
  const document: WorkflowEditorDocument = { session, meta };

  const issues = [...validateSemantics(session, document), ...warningIssues];
  const hasError = issues.some((i) => i.severity === "error");

  return {
    ok: !hasError,
    value: {
      importMode: session.importMode,
      ...(session.allowCycles !== undefined ? { allowCycles: session.allowCycles } : {}),
      workflows: session.workflows,
    },
    document,
    issues,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
