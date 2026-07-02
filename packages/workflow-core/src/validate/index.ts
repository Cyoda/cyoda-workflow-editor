import { ImportPayloadSchema, ExportPayloadSchema } from "../schema/payload.js";
import type { WorkflowEditorDocument } from "../types/editor.js";
import type { WorkflowSession } from "../types/session.js";
import type { ValidationIssue } from "../types/validation.js";
import { zodErrorToIssues } from "./schema.js";
import { validateSemantics } from "./semantic.js";

export { validateSemantics, ANNOTATIONS_MAX_BYTES } from "./semantic.js";
export { zodErrorToIssues } from "./schema.js";

/**
 * Validate a raw payload against the ImportPayload schema. Returns any issues.
 */
export function validateImportSchema(raw: unknown): ValidationIssue[] {
  const parsed = ImportPayloadSchema.safeParse(raw);
  return parsed.success ? [] : zodErrorToIssues(parsed.error);
}

/**
 * Validate a raw payload against the ExportPayload schema. Returns any issues.
 */
export function validateExportSchema(raw: unknown): ValidationIssue[] {
  const parsed = ExportPayloadSchema.safeParse(raw);
  return parsed.success ? [] : zodErrorToIssues(parsed.error);
}

/**
 * Combined schema + semantic validation over a document.
 */
export function validateAll(doc: WorkflowEditorDocument): ValidationIssue[] {
  return validateSemantics(doc.session, doc);
}

/**
 * Combined schema + semantic validation over a session (without metadata).
 */
export function validateSession(session: WorkflowSession): ValidationIssue[] {
  return validateSemantics(session);
}
