import { useCallback, useRef, useState } from "react";
import {
  WorkflowApiConflictError,
  type ConcurrencyToken,
  type ImportMode,
  type ImportPayload,
  type SaveStatus,
  type WorkflowApi,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";

export interface UseSaveFlowArgs {
  api: WorkflowApi;
  document: WorkflowEditorDocument;
  /**
   * Concurrency token from the last successful `exportWorkflows` / `importWorkflows`.
   * `null` means we have no server context (first-save scenario).
   */
  concurrencyToken: ConcurrencyToken | null;
  /** Called after a successful save to refresh the session and token. */
  onSaved: (nextToken: ConcurrencyToken | null) => void;
  /** Called when the user chooses "Reload" from the conflict banner. */
  onReload?: () => void;
}

export interface SaveFlow {
  status: SaveStatus;
  /** Show the confirmation modal — REPLACE / ACTIVATE require explicit confirm (§17.3). */
  requestSave: () => void;
  /** Called from the modal after the user confirms. */
  confirmSave: () => Promise<void>;
  /** Dismiss the confirmation modal without dispatching. */
  cancel: () => void;
  /** Force-overwrite branch of the 409 banner (§17.4). */
  forceOverwrite: () => Promise<void>;
  /** Reload branch of the 409 banner — delegates to `onReload`. */
  reload: () => void;
  /** Reset status back to idle after viewing a success/error toast. */
  clear: () => void;
}

/**
 * Save-flow hook per spec §17.3. Owns the modal/banner state machine so
 * the shell only needs to render the current `status` and call `requestSave`
 * from the toolbar's Save button.
 */
export function useSaveFlow(args: UseSaveFlowArgs): SaveFlow {
  const { api, document: doc, concurrencyToken, onSaved, onReload } = args;
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const tokenRef = useRef<ConcurrencyToken | null>(concurrencyToken);
  tokenRef.current = concurrencyToken;

  const entityRef = useRef(doc.session.entity);
  entityRef.current = doc.session.entity;

  const payloadRef = useRef<ImportPayload>({
    importMode: doc.session.importMode,
    workflows: doc.session.workflows,
  });
  payloadRef.current = {
    importMode: doc.session.importMode,
    workflows: doc.session.workflows,
  };

  const savingRef = useRef(false);

  const performImport = useCallback(
    async (token: ConcurrencyToken | null) => {
      if (savingRef.current) return;
      const entity = entityRef.current;
      if (!entity) {
        setStatus({
          kind: "error",
          message: "Cannot save: session has no entity identity.",
        });
        return;
      }
      savingRef.current = true;
      setStatus({ kind: "saving" });
      try {
        const result = await api.importWorkflows(entity, payloadRef.current, {
          concurrencyToken: token,
        });
        onSaved(result.concurrencyToken);
        setStatus({ kind: "success", at: Date.now() });
      } catch (err) {
        if (err instanceof WorkflowApiConflictError) {
          setStatus({
            kind: "conflict",
            serverConcurrencyToken: err.serverConcurrencyToken,
          });
          return;
        }
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown save error.",
        });
      } finally {
        savingRef.current = false;
      }
    },
    [api, onSaved],
  );

  const requestSave = useCallback(() => {
    const mode: ImportMode = payloadRef.current.importMode;
    const requiresExplicitConfirm = mode === "REPLACE" || mode === "ACTIVATE";
    setStatus({ kind: "confirming", mode, requiresExplicitConfirm });
  }, []);

  const confirmSave = useCallback(
    () => performImport(tokenRef.current),
    [performImport],
  );

  const cancel = useCallback(() => setStatus({ kind: "idle" }), []);

  const forceOverwrite = useCallback(() => performImport(null), [performImport]);

  const reload = useCallback(() => {
    onReload?.();
    setStatus({ kind: "idle" });
  }, [onReload]);

  const clear = useCallback(() => setStatus({ kind: "idle" }), []);

  return { status, requestSave, confirmSave, cancel, forceOverwrite, reload, clear };
}
