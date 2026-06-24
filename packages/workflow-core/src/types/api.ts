import type { EntityIdentity, ExportPayload, ImportMode, ImportPayload } from "./session.js";

/**
 * Opaque concurrency token returned by `exportWorkflows` and echoed back
 * on `importWorkflows` to enable 409 detection (spec §17.4).
 *
 * [Unverified] The shape of this token is a spec §30 open question — keep it
 * opaque so servers can use ETags, revision numbers, or session nonces
 * interchangeably.
 */
export type ConcurrencyToken = string;

export interface ExportResult {
  payload: ExportPayload;
  concurrencyToken: ConcurrencyToken | null;
}

export interface ImportResult {
  /** New concurrency token assigned by the server after the import succeeded. */
  concurrencyToken: ConcurrencyToken | null;
}

/**
 * Contract between the configurator shell and the Cyoda backend (spec §17.1).
 * Implementations are expected to be thin wrappers around a REST client;
 * the editor never constructs requests directly.
 */
export interface WorkflowApi {
  /**
   * Fetch the active workflows for an entity. When `concurrencyToken`
   * is present on the result, the save flow passes it back on the next
   * import to detect 409 conflicts.
   */
  exportWorkflows(entity: EntityIdentity): Promise<ExportResult>;

  /**
   * Submit a workflow payload to the backend.
   *
   * Implementations MUST throw `WorkflowApiConflictError` when the server
   * responds with a 409 (stale concurrency token).
   */
  importWorkflows(
    entity: EntityIdentity,
    payload: ImportPayload,
    opts?: { concurrencyToken?: ConcurrencyToken | null },
  ): Promise<ImportResult>;
}

/**
 * Thrown by `importWorkflows` when the backend responds with a 409
 * (spec §17.4). The editor shell surfaces a non-dismissable banner offering
 * Reload (re-fetch + discard local) or Force overwrite (resend without
 * the token).
 */
export class WorkflowApiConflictError extends Error {
  override readonly name = "WorkflowApiConflictError";
  constructor(
    public readonly entity: EntityIdentity,
    public readonly serverConcurrencyToken: ConcurrencyToken | null,
    message = "Workflow save conflict: server state has changed.",
  ) {
    super(message);
  }
}

/**
 * Thrown by either API method when the transport itself fails (network
 * error, 5xx). Separate class so the save modal can distinguish transient
 * failures from genuine concurrency conflicts.
 */
export class WorkflowApiTransportError extends Error {
  override readonly name = "WorkflowApiTransportError";
  constructor(
    public override readonly cause: unknown,
    message = "Workflow API transport error.",
  ) {
    super(message);
  }
}

/** Visible save-flow state surfaced to the UI shell (spec §17.3). */
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "confirming"; mode: ImportMode; requiresExplicitConfirm: boolean }
  | { kind: "saving" }
  | { kind: "success"; at: number }
  | { kind: "conflict"; serverConcurrencyToken: ConcurrencyToken | null }
  | { kind: "error"; message: string };
