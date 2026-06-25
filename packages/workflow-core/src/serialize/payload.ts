import {
  type CyodaSchemaVersion,
  getDialect,
  LATEST_CYODA_VERSION,
} from "../dialect/index.js";
import type { WorkflowEditorDocument } from "../types/editor.js";
import type { EntityIdentity } from "../types/session.js";
import { prettyStringify } from "./stringify.js";

interface SerializeOptions {
  /** cyoda-go schema dialect to emit. Defaults to the document's recorded version, else latest. */
  targetVersion?: CyodaSchemaVersion;
}

/** Render canonical workflows in the chosen dialect's wire shape. */
function wireWorkflows(doc: WorkflowEditorDocument, options?: SerializeOptions) {
  const version = options?.targetVersion ?? doc.meta.cyodaVersion ?? LATEST_CYODA_VERSION;
  return getDialect(version).workflowsToWire(doc.session.workflows);
}

/**
 * Serialize an editor document as an ImportPayload JSON string.
 * Import payloads have keys ordered: importMode, workflows.
 */
export function serializeImportPayload(
  doc: WorkflowEditorDocument,
  options?: SerializeOptions,
): string {
  const payload = {
    importMode: doc.session.importMode,
    workflows: wireWorkflows(doc, options),
  };
  return prettyStringify(payload);
}

/**
 * Serialize an editor document as an ExportPayload JSON string.
 * Export payloads have keys ordered: entityName, modelVersion, workflows.
 *
 * If the caller provides an `entity` override, it is used; otherwise the
 * session's entity is required (else throws).
 */
export function serializeExportPayload(
  doc: WorkflowEditorDocument,
  entity?: EntityIdentity,
  options?: SerializeOptions,
): string {
  const e = entity ?? doc.session.entity;
  if (e == null) {
    throw new Error("serializeExportPayload requires an entity identity");
  }
  const payload = {
    entityName: e.entityName,
    modelVersion: e.modelVersion,
    workflows: wireWorkflows(doc, options),
  };
  return prettyStringify(payload);
}

/**
 * Serialize the full editor document (session + metadata) for in-app persistence.
 * Not for export to Cyoda.
 */
export function serializeEditorDocument(
  doc: WorkflowEditorDocument,
  options?: SerializeOptions,
): string {
  return prettyStringify({
    session: {
      entity: doc.session.entity,
      importMode: doc.session.importMode,
      workflows: wireWorkflows(doc, options),
    },
    meta: doc.meta,
  });
}
