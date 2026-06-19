import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Connection, Edge } from "reactflow";
import {
  applyPatch,
  type DomainPatch,
  type EdgeAnchor,
  type EdgeAnchorPair,
  type EditorViewport,
  type EntityFieldHintProvider,
  type PatchTransaction,
  invertPatch,
  LATEST_CYODA_VERSION,
  SUPPORTED_CYODA_VERSIONS,
  parseImportPayload,
  serializeImportPayload,
  PatchConflictError,
  type Workflow,
  type WorkflowEditorDocument,
  type WorkflowUiMeta,
} from "@cyoda/workflow-core";
import { estimateNodeSize, type LayoutOptions, type PinnedNode } from "@cyoda/workflow-layout";
import {
  EditorConfigContext,
  I18nContext,
  mergeMessages,
  type PartialMessages,
} from "../i18n/context.js";
import { useEditorStore } from "../state/store.js";
import { deriveFromDocument } from "../state/derive.js";
import type { EditorMode, Selection } from "../state/types.js";
import { Canvas } from "./Canvas.js";
import { resolveConnection, type PendingConnect } from "./resolveConnection.js";
import { Inspector } from "../inspector/Inspector.js";
import { Toolbar, type IssueSeverity } from "../toolbar/Toolbar.js";
import { IssuesDrawer } from "../toolbar/IssuesDrawer.js";
import { WorkflowTabs } from "../toolbar/WorkflowTabs.js";
import { DeleteStateModal } from "../modals/DeleteStateModal.js";
import { DragConnectModal } from "../modals/DragConnectModal.js";
import { AddStateModal } from "../modals/AddStateModal.js";
import { HelpModal } from "../modals/HelpModal.js";
import { VersionSwitchModal } from "../modals/VersionSwitchModal.js";
import { CommentNode } from "./CommentNode.js";
import type { RfEdgeData } from "./RfTransitionEdge.js";
import {
  WorkflowJsonEditor,
  type JsonEditStatus,
  type WorkflowJsonEditorConfig,
} from "./WorkflowJsonEditor.js";

/** Controls which chrome elements the editor shell renders. All fields default to `true`. */
export interface ChromeOptions {
  /** Top toolbar (undo/redo/validation pills/save). Default: true. */
  toolbar?: boolean;
  /** Workflow tabs bar. Default: true (also gated by existing single-workflow-viewer rule). */
  tabs?: boolean;
  /** Right-side inspector panel. Default: true. */
  inspector?: boolean;
  /** Canvas minimap. Default: true. */
  minimap?: boolean;
  /** Canvas zoom/pan controls. Default: true. */
  controls?: boolean;
}

export interface WorkflowEditorProps {
  document: WorkflowEditorDocument;
  mode?: EditorMode;
  surface?: WorkflowEditorSurface;
  layout?: WorkflowEditorLayout;
  messages?: PartialMessages;
  layoutOptions?: LayoutOptions;
  /** Selectively suppress editor chrome for compact embed scenarios. */
  chrome?: ChromeOptions;
  onChange?: (doc: WorkflowEditorDocument) => void;
  onSave?: (doc: WorkflowEditorDocument) => void;
  showSaveButton?: boolean;
  toolbarStart?: ReactNode;
  toolbarCenter?: ReactNode;
  toolbarEnd?: ReactNode;
  /**
   * Host-controlled layout/UI metadata. When provided it takes precedence over
   * the editor's internal localStorage persistence.
   */
  layoutMetadata?: WorkflowUiMeta;
  /** Called whenever layout positions or other editor-only metadata change. */
  onLayoutMetadataChange?: (meta: WorkflowUiMeta) => void;
  /** Called with the full per-workflow UI map whenever any layout changes — use this for file-based persistence. */
  onWorkflowUiChange?: (workflowUi: Record<string, WorkflowUiMeta>) => void;
  /**
   * localStorage key prefix for layout persistence. Defaults to
   * "cyoda-editor-layout". Pass `null` to disable localStorage persistence.
   */
  localStorageKey?: string | null;
  /** Enables the canonical JSON editing surface inside the editor shell. */
  enableJsonEditor?: boolean;
  /** Controls whether JSON appears as a tab or alongside the graph. */
  jsonEditorPlacement?: "tab" | "split";
  /** Optional host-supplied Monaco runtime/configuration. */
  jsonEditor?: WorkflowJsonEditorConfig | null;
  /** Reports JSON parse/schema/apply status for host UX. */
  onJsonStatusChange?: (status: JsonEditStatus) => void;
  /**
   * Optional model-schema autocomplete source for criterion jsonPath inputs.
   * When omitted, jsonPath inputs render as plain free-text fields.
   */
  hintProvider?: EntityFieldHintProvider;
  /**
   * Show developer-oriented affordances (raw JSON tab in the inspector and
   * other diagnostics). Defaults to `false` so SMEs/BAs see a clean view.
   * Existing demo and admin surfaces that previously relied on the JSON tab
   * should opt in explicitly with `developerMode={true}`.
   */
  developerMode?: boolean;
}

interface PendingDelete {
  workflow: string;
  stateCode: string;
}

interface PendingAddState {
  position?: { x: number; y: number };
}

export type WorkflowEditorSurface = "dev-console";
export type WorkflowEditorLayout = "embedded" | "fullWidth";

type WorkflowEditorActiveSurface = "graph" | "json";

function hasPersistedWorkflowUi(meta: WorkflowUiMeta | undefined): meta is WorkflowUiMeta {
  return !!meta && Object.values(meta).some((value) => value !== undefined);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function defaultNewWorkflow(existing: string[]): Workflow {
  let n = existing.length + 1;
  while (existing.includes(`workflow${n}`)) n++;
  return {
    version: "1.0",
    name: `workflow${n}`,
    initialState: "start",
    active: true,
    states: { start: { transitions: [] } },
  };
}

/** Top-level editor shell — spec §14. Provides viewer/playground/editor modes. */
export function WorkflowEditor({
  document: initialDocument,
  mode = "editor",
  surface = "dev-console",
  layout = "embedded",
  messages,
  layoutOptions,
  chrome,
  onChange,
  onSave,
  showSaveButton = true,
  toolbarStart,
  toolbarCenter,
  toolbarEnd,
  layoutMetadata: externalLayoutMeta,
  onLayoutMetadataChange,
  onWorkflowUiChange,
  localStorageKey = "cyoda-editor-layout",
  enableJsonEditor = false,
  jsonEditorPlacement = "tab",
  jsonEditor = null,
  onJsonStatusChange,
  hintProvider,
  developerMode = false,
}: WorkflowEditorProps) {
  const mergedMessages = useMemo(() => mergeMessages(messages), [messages]);
  const editorConfig = useMemo(() => ({ developerMode }), [developerMode]);

  // Merge localStorage layout into the initial document on first render only.
  const initialDocumentWithLayout = useMemo(() => {
    if (localStorageKey === null) return initialDocument;
    try {
      const stored = localStorage.getItem(localStorageKey);
      if (!stored) return initialDocument;
      const parsed = JSON.parse(stored) as Record<string, WorkflowUiMeta>;
      const merged: Record<string, WorkflowUiMeta> = { ...initialDocument.meta.workflowUi };
      for (const [wfName, ui] of Object.entries(parsed)) {
        merged[wfName] = { ...(merged[wfName] ?? {}), ...ui };
      }
      return {
        ...initialDocument,
        meta: { ...initialDocument.meta, workflowUi: merged },
      };
    } catch {
      return initialDocument;
    }
    // Intentionally runs once on mount only — localStorage merge is a one-time init.
  }, []);

  const [state, actions] = useEditorStore(initialDocumentWithLayout, mode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(384);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(null);
  const [pendingAddState, setPendingAddState] = useState<PendingAddState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const [activeSurface, setActiveSurface] = useState<WorkflowEditorActiveSurface>("graph");
  const [jsonStatus, setJsonStatus] = useState<JsonEditStatus>({ status: "idle" });
  const [openIssueSeverity, setOpenIssueSeverity] = useState<IssueSeverity | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  interface PendingVersionSwitch {
    targetVersion: string;
    document: WorkflowEditorDocument;
    warnings: string[];
  }
  const [pendingVersionSwitch, setPendingVersionSwitch] = useState<PendingVersionSwitch | null>(null);
  const selectionRef = useRef<Selection>(state.selection);
  const documentStateRef = useRef(state.document);
  const activeWorkflowRef = useRef(state.activeWorkflow);
  const pendingSelectionRestoreRef = useRef<Selection>(null);
  // Populated by Canvas with a function returning a viewport-centred,
  // non-overlapping position for toolbar/keyboard-added states (issue #20).
  const newStatePositionRef = useRef<(() => { x: number; y: number } | null) | null>(null);

  useEffect(() => {
    selectionRef.current = state.selection;
  }, [state.selection]);

  useEffect(() => {
    documentStateRef.current = state.document;
    activeWorkflowRef.current = state.activeWorkflow;
  }, [state.document, state.activeWorkflow]);

  useEffect(() => {
    onChange?.(state.document);
  }, [state.document, onChange]);

  // Persist layout/comments to localStorage and notify host whenever workflowUi changes.
  useEffect(() => {
    try {
      const toStore: Record<string, WorkflowUiMeta> = {};
      for (const [wfName, ui] of Object.entries(state.document.meta.workflowUi)) {
        if (hasPersistedWorkflowUi(ui)) {
          toStore[wfName] = ui;
        }
      }
      if (localStorageKey !== null) {
        if (Object.keys(toStore).length > 0) {
          localStorage.setItem(localStorageKey, JSON.stringify(toStore));
        } else {
          localStorage.removeItem(localStorageKey);
        }
      }
      onWorkflowUiChange?.(toStore);
    } catch {
      // Ignore storage quota or SSR errors.
    }
  }, [state.document.meta.workflowUi, localStorageKey, onWorkflowUiChange]);

  // Notify host of layout changes.
  useEffect(() => {
    if (!onLayoutMetadataChange || !state.activeWorkflow) return;
    const ui = state.document.meta.workflowUi[state.activeWorkflow];
    if (ui) onLayoutMetadataChange(ui);
  }, [state.document.meta.workflowUi, state.activeWorkflow, onLayoutMetadataChange]);

  // No longer using the Web Fullscreen API — it is unreliable in Tauri's WKWebView.
  // Fullscreen is simulated via CSS (position:fixed / inset:0) instead.

  const handleInspectorResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = inspectorWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setInspectorWidth(Math.max(360, startWidth + delta));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [inspectorWidth]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  const readOnly = state.mode === "viewer";
  const derived = useMemo(
    () => deriveFromDocument(state.document),
    [state.document],
  );

  const dispatch = useCallback(
    (patch: DomainPatch) => {
      if (patch.op === "setCriterion" && patch.host.kind === "transition") {
        const restoreSelection: Selection = {
          kind: "transition",
          transitionUuid: patch.host.transitionUuid,
        };
        pendingSelectionRestoreRef.current = restoreSelection;
        window.setTimeout(() => {
          if (sameSelection(pendingSelectionRestoreRef.current, restoreSelection)) {
            actions.setSelection(restoreSelection);
            pendingSelectionRestoreRef.current = null;
          }
        }, 50);
        actions.dispatchTransaction({
          summary: patch.criterion ? "Set criterion" : "Clear criterion",
          patches: [patch],
          inverses: [invertPatch(state.document, patch)],
          selectionAfter: restoreSelection,
        });
        return;
      }
      if (patch.op === "renameState" && selectionRef.current?.kind === "state" && selectionRef.current.stateCode === patch.from && selectionRef.current.workflow === patch.workflow) {
        const nextDoc = applyPatch(state.document, patch);
        const newNodeId = Object.entries(nextDoc.meta.ids.states).find(([, ptr]) => ptr.workflow === patch.workflow && ptr.state === patch.to)?.[0] ?? "";
        actions.dispatchTransaction({
          summary: `Rename state "${patch.from}" → "${patch.to}"`,
          patches: [patch],
          inverses: [{ op: "renameState", workflow: patch.workflow, from: patch.to, to: patch.from }],
          selectionAfter: { kind: "state", workflow: patch.workflow, stateCode: patch.to, nodeId: newNodeId },
        });
        return;
      }
      // When retargeting a transition (changing next), clear its block position
      // so it recomputes to the new geometry midpoint.
      if (patch.op === "updateTransition" && patch.updates.next !== undefined) {
        const ptr = state.document.meta.ids.transitions[patch.transitionUuid];
        if (ptr) {
          const hasStoredPos = !!state.document.meta.workflowUi[ptr.workflow]?.transitionPositions?.[patch.transitionUuid];
          if (hasStoredPos) {
            const clearPatch: DomainPatch = { op: "removeTransitionBlockPosition", transitionId: patch.transitionUuid };
            actions.dispatchTransaction({
              summary: "Update transition",
              patches: [patch, clearPatch],
              inverses: [invertPatch(state.document, clearPatch), invertPatch(state.document, patch)],
            });
            return;
          }
        }
      }
      if (patch.op === "moveTransitionSource") {
        const nextDoc = applyPatch(state.document, patch);
        const newUuid = transitionUuidByName(nextDoc, patch.workflow, patch.toState, patch.transitionName);
        const oldUuid = transitionUuidByName(state.document, patch.workflow, patch.fromState, patch.transitionName);
        const patches: DomainPatch[] = [patch];
        const inverses: DomainPatch[] = [{ op: "moveTransitionSource", workflow: patch.workflow, fromState: patch.toState, toState: patch.fromState, transitionName: patch.transitionName }];
        // Clear the block position for the moved transition (UUID may have changed)
        if (newUuid) {
          const clearPatch: DomainPatch = { op: "removeTransitionBlockPosition", transitionId: newUuid };
          patches.push(clearPatch);
          inverses.unshift(invertPatch(state.document, clearPatch));
        } else if (oldUuid) {
          const clearPatch: DomainPatch = { op: "removeTransitionBlockPosition", transitionId: oldUuid };
          patches.push(clearPatch);
          inverses.unshift(invertPatch(state.document, clearPatch));
        }
        actions.dispatchTransaction({
          summary: `Move transition "${patch.transitionName}" to "${patch.toState}"`,
          patches,
          inverses,
          selectionAfter: newUuid ? { kind: "transition", transitionUuid: newUuid } : null,
        });
        return;
      }
      actions.dispatch(patch);
    },
    [actions, state.document],
  );
  const handleJsonStatusChange = useCallback(
    (status: JsonEditStatus) => {
      setJsonStatus(status);
      onJsonStatusChange?.(status);
    },
    [onJsonStatusChange],
  );
  const jsonEditorVisible =
    enableJsonEditor && (jsonEditorPlacement === "split" || activeSurface === "json");
  const graphVisible =
    !enableJsonEditor || jsonEditorPlacement === "split" || activeSurface === "graph";
  const inspectorVisible =
    chrome?.inspector !== false &&
    inspectorOpen &&
    (!enableJsonEditor || jsonEditorPlacement !== "tab" || activeSurface === "graph");
  const saveBlockedByJson =
    jsonStatus.status === "invalid-json" || jsonStatus.status === "invalid-schema";
  const saveDisabled = readOnly || derived.errorCount > 0 || saveBlockedByJson;

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number, allPositions: ReadonlyArray<{ id: string; x: number; y: number }>) => {
      // Check if the dragged node is a transition block (in ids.transitions, not ids.states)
      const transitionPtr = state.document.meta.ids.transitions[nodeId];
      if (transitionPtr) {
        // Dragging a transition block — save only its position
        const patch: DomainPatch = { op: "setTransitionBlockPosition", transitionId: nodeId, x, y };
        const inverse = invertPatch(state.document, patch);
        actions.dispatchTransaction({ patches: [patch], inverses: [inverse], summary: "Move transition block" });
        return;
      }
      // Otherwise handle as state node drag (existing behavior)
      const ids = state.document.meta.ids.states;
      const patches: DomainPatch[] = [];
      for (const { id, x: px, y: py } of allPositions) {
        const ptr = ids[id];
        if (!ptr) continue;
        patches.push({ op: "setNodePosition", workflow: ptr.workflow, stateCode: ptr.state, x: px, y: py, ...(id === nodeId ? { pinned: true } : {}) });
      }
      if (patches.length === 0) return;
      const inverses = patches.map((p) => invertPatch(state.document, p));
      actions.dispatchTransaction({ patches, inverses, summary: "Move state" });
    },
    [state.document, actions],
  );

  const handleAutoLayout = useCallback(() => {
    const workflow = state.activeWorkflow;
    if (!workflow) return;
    // Clear all pinned positions so ELK can arrange everything from scratch.
    const workflowUi = { ...state.document.meta.workflowUi };
    const current = workflowUi[workflow] ?? {};
    workflowUi[workflow] = { ...current, layout: undefined, edgeAnchors: undefined, transitionPositions: undefined };
    actions.silentReplace(
      {
        session: state.document.session,
        meta: { ...state.document.meta, workflowUi, revision: state.document.meta.revision + 1 },
      },
      { preserveEditorState: true },
    );
    // Bump layoutKey to force Canvas to re-run ELK.
    setLayoutKey((k) => k + 1);
  }, [state.activeWorkflow, state.document, actions]);

  const openAddStateModal = useCallback((position?: { x: number; y: number }) => {
    // For toolbar/keyboard adds (no explicit position) fall back to the centre
    // of the visible viewport so the new state lands in view (issue #20).
    const resolved = position ?? newStatePositionRef.current?.() ?? undefined;
    setPendingAddState(resolved ? { position: resolved } : {});
  }, []);

  // Build pinned nodes from workflowUi layout metadata for the active workflow.
  const pinnedNodes = useMemo((): PinnedNode[] | undefined => {
    const workflow = state.activeWorkflow;
    if (!workflow) return undefined;
    // Use external metadata if provided, otherwise use internal store.
    const layoutNodes =
      externalLayoutMeta?.layout?.nodes ??
      state.document.meta.workflowUi[workflow]?.layout?.nodes;
    if (!layoutNodes) return undefined;
    const codeToUuid = new Map<string, string>();
    for (const [uuid, ptr] of Object.entries(state.document.meta.ids.states)) {
      if (ptr.workflow === workflow) codeToUuid.set(ptr.state, uuid);
    }
    const result = Object.entries(layoutNodes)
      .map(([stateCode, pos]) => {
        const id = codeToUuid.get(stateCode);
        return id ? { id, x: pos.x, y: pos.y } : null;
      })
      .filter((p): p is PinnedNode => p !== null);
    return result;
  }, [
    state.activeWorkflow,
    state.document.meta.ids.states,
    state.document.meta.workflowUi,
    externalLayoutMeta,
  ]);

  const handleVersionChange = useCallback(
    (targetVersion: string) => {
      const wireJson = serializeImportPayload(state.document);
      const result = parseImportPayload(wireJson, state.document.meta, { sourceVersion: targetVersion });
      if (!result.ok || !result.document) return;
      const docWithVersion: WorkflowEditorDocument = {
        ...result.document,
        meta: { ...result.document.meta, cyodaVersion: targetVersion },
      };
      // Detect lossiness by comparing wire output before and after the version
      // switch. parseImportPayload warnings only cover toCanonical-phase drops
      // (e.g. scheduled processors); serialization-phase drops (e.g. v0.7
      // omitting transitions[].schedule) are invisible to warnings but visible
      // in the serialized output.
      const beforeJson = wireJson;
      const afterJson = serializeImportPayload(docWithVersion);
      const parseWarnings = result.warnings ?? [];
      const isLossy = beforeJson !== afterJson || parseWarnings.length > 0;
      const warnings: string[] = parseWarnings.length > 0
        ? parseWarnings
        : isLossy
          ? ["Some fields supported in the current version are not present in the target version and will be removed."]
          : [];
      if (isLossy) {
        setPendingVersionSwitch({ targetVersion, document: docWithVersion, warnings });
      } else {
        actions.silentReplace(docWithVersion, { preserveEditorState: true });
      }
    },
    [state.document, actions],
  );

  const requestDeleteState = (workflow: string, stateCode: string) => {
    setPendingDelete({ workflow, stateCode });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    dispatch({
      op: "removeState",
      workflow: pendingDelete.workflow,
      stateCode: pendingDelete.stateCode,
    });
    setPendingDelete(null);
  };

  const handleConnect = (connection: Connection) => {
    const resolved = resolveConnection(state.document, connection);
    if (resolved) setPendingConnect(resolved);
  };

  const handleReconnect = useCallback(
    (edge: Edge<RfEdgeData>, connection: Connection) => {
      setReconnectError(null);
      const tx = buildReconnectTransaction(state.document, edge, connection);
      if (!tx.ok) {
        if (tx.reason) setReconnectError(tx.reason);
        return;
      }
      try {
        actions.dispatchTransaction(tx.transaction);
      } catch (error) {
        if (error instanceof PatchConflictError) {
          setReconnectError(error.message);
          return;
        }
        throw error;
      }
    },
    [actions, state.document],
  );

  const confirmConnect = useCallback(
    (name: string) => {
      if (!pendingConnect) return;
      // We apply addTransition first to learn the minted UUID, then build the
      // exact removeTransition inverse for a clean single-step undo.
      const addPatch: DomainPatch = {
        op: "addTransition",
        workflow: pendingConnect.workflow,
        fromState: pendingConnect.fromState,
        transition: { name, next: pendingConnect.toState, manual: false, disabled: false },
      };
      const priorUUIDs = new Set(Object.keys(state.document.meta.ids.transitions));
      const afterApply = applyPatch(state.document, addPatch);
      const newUUID = Object.keys(afterApply.meta.ids.transitions).find(
        (u) => !priorUUIDs.has(u),
      );
      actions.dispatchTransaction({
        summary: `Add transition "${name}"`,
        patches: [addPatch],
        inverses: newUUID
          ? [{ op: "removeTransition", transitionUuid: newUUID }]
          : [{ op: "replaceSession", session: structuredClone(state.document.session) }],
        selectionAfter: newUUID ? { kind: "transition", transitionUuid: newUUID } : null,
      });
      setPendingConnect(null);
    },
    [pendingConnect, state.document, actions],
  );

  const workflows = state.document.session.workflows;
  const showTabs = workflows.length > 1 || state.mode !== "viewer";

  const handleSelectionChange = useCallback(
    (selection: Selection) => {
      const pendingRestore = pendingSelectionRestoreRef.current;
      if (!selection && pendingRestore) {
        return;
      }
      if (selection && pendingRestore) pendingSelectionRestoreRef.current = null;
      if (selection) setInspectorOpen(true);
      else setInspectorOpen(false);
      const workflow = workflowForSelection(documentStateRef.current, selection);
      if (workflow && workflow !== activeWorkflowRef.current) {
        actions.setActiveWorkflow(workflow);
      }
      selectionRef.current = selection;
      actions.setSelection(selection);
    },
    [actions],
  );

  const confirmAddState = useCallback(
    (name: string) => {
      const workflow = state.activeWorkflow;
      const requestedPosition = pendingAddState?.position;
      setPendingAddState(null);
      if (!workflow) return;
      const patches: DomainPatch[] = [{ op: "addState", workflow, stateCode: name }];
      if (requestedPosition) {
        const size = estimateNodeSize(name);
        patches.push({
          op: "setNodePosition",
          workflow,
          stateCode: name,
          x: snapToGrid(requestedPosition.x - size.width / 2),
          y: snapToGrid(requestedPosition.y - size.height / 2),
          pinned: true,
        });
      }
      actions.dispatchTransaction({
        summary: `Add state "${name}"`,
        patches,
        inverses: [{ op: "removeState", workflow, stateCode: name }],
        selectionAfter: { kind: "state", workflow, stateCode: name, nodeId: "" },
      });
    },
    [pendingAddState, state.activeWorkflow, actions],
  );

  const anyModalOpen = pendingDelete !== null || pendingConnect !== null || pendingAddState !== null || helpOpen;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (anyModalOpen) return;
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        if (!readOnly && state.undoStack.length > 0) {
          e.preventDefault();
          actions.undo();
        }
        return;
      }
      if (mod && ((e.key === "z" && e.shiftKey) || e.key === "y" || e.key === "Y")) {
        if (!readOnly && state.redoStack.length > 0) {
          e.preventDefault();
          actions.redo();
        }
        return;
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        if (onSave && !saveDisabled) {
          e.preventDefault();
          onSave(state.document);
        }
        return;
      }
      if (!readOnly && !mod && e.key === "l") {
        e.preventDefault();
        handleAutoLayout();
        return;
      }
      if (!readOnly && !mod && e.key === "a") {
        e.preventDefault();
        openAddStateModal();
        return;
      }
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      if (e.key === "Escape" && (state.selection || inspectorOpen)) {
        e.preventDefault();
        handleSelectionChange(null);
      }
    },
    [
      anyModalOpen,
      readOnly,
      state.undoStack.length,
      state.redoStack.length,
      state.document,
      actions,
      onSave,
      saveDisabled,
      handleAutoLayout,
      handleSelectionChange,
      state.selection,
      inspectorOpen,
    ],
  );

  const handleDeleteKeyDownCapture = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (anyModalOpen || readOnly || isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;

      const selection = selectionRef.current;
      if (selection?.kind === "state") {
        e.preventDefault();
        e.stopPropagation();
        requestDeleteState(selection.workflow, selection.stateCode);
        return;
      }
      if (selection?.kind === "transition") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ op: "removeTransition", transitionUuid: selection.transitionUuid });
      }
    },
    [anyModalOpen, readOnly, state.selection],
  );

  useEffect(() => {
    const handleDocumentDeleteKeyDown = (event: KeyboardEvent) => {
      if (anyModalOpen || readOnly || isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;

      const selection = selectionRef.current;
      if (selection?.kind === "state") {
        event.preventDefault();
        event.stopPropagation();
        requestDeleteState(selection.workflow, selection.stateCode);
        return;
      }
      if (selection?.kind === "transition") {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ op: "removeTransition", transitionUuid: selection.transitionUuid });
      }
    };

    document.addEventListener("keydown", handleDocumentDeleteKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleDocumentDeleteKeyDown, true);
    };
  }, [anyModalOpen, readOnly, dispatch]);

  const pendingConnectState = useMemo(() => {
    if (!pendingConnect) return null;
    const wf = state.document.session.workflows.find(
      (w) => w.name === pendingConnect.workflow,
    );
    if (!wf) return null;
    return wf.states[pendingConnect.fromState] ?? null;
  }, [pendingConnect, state.document]);

  const orientation = layoutOptions?.orientation ?? "vertical";
  // Merge pinned positions from editor metadata into layout options.
  const effectiveLayoutOptions = useMemo<LayoutOptions>(
    () => ({ ...layoutOptions, pinned: pinnedNodes }),
    [layoutOptions, pinnedNodes],
  );
  const savedViewport =
    state.activeWorkflow
      ? state.document.meta.workflowUi[state.activeWorkflow]?.viewports?.[orientation]
      : undefined;

  useEffect(() => {
    if (enableJsonEditor) return;
    setJsonStatus({ status: "idle" });
    onJsonStatusChange?.({ status: "idle" });
  }, [enableJsonEditor, onJsonStatusChange]);

  const handleViewportChange = useCallback(
    (viewport: EditorViewport) => {
      const workflow = state.activeWorkflow;
      if (!workflow) return;
      const current = state.document.meta.workflowUi[workflow] ?? {};
      const existing = current.viewports?.[orientation];
      const nextViewport = normalizeViewport(viewport);
      if (existing && sameViewport(existing, nextViewport)) return;

      actions.silentReplace(
        {
          session: state.document.session,
          meta: {
            ...state.document.meta,
            workflowUi: {
              ...state.document.meta.workflowUi,
              [workflow]: {
                ...current,
                viewports: {
                  ...(current.viewports ?? {}),
                  [orientation]: nextViewport,
                },
              },
            },
          },
        },
        { preserveEditorState: true },
      );
    },
    [actions, orientation, state.activeWorkflow, state.document],
  );

  const handlePaneDoubleClick = useCallback((x: number, y: number) => {
    if (readOnly || anyModalOpen) return;
    openAddStateModal({ x, y });
  }, [anyModalOpen, openAddStateModal, readOnly]);

  const graphPane = (
    <div
      data-testid="workflow-editor-graph-pane"
      style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%", position: "relative" }}
    >
      <Canvas
        graph={derived.graph}
        issues={derived.issues}
        activeWorkflow={state.activeWorkflow}
        selection={state.selection}
        layoutOptions={effectiveLayoutOptions}
        savedViewport={savedViewport}
        onSelectionChange={handleSelectionChange}
        onViewportChange={handleViewportChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onNodesDelete={(nodes) => {
          if (readOnly || anyModalOpen) return;
          const node = nodes[0]?.data?.node;
          if (node) requestDeleteState(node.workflow, node.stateCode);
        }}
        onEdgesDelete={(edges) => {
          if (readOnly || anyModalOpen) return;
          const edge = edges[0];
          if (edge) dispatch({ op: "removeTransition", transitionUuid: edge.id });
        }}
        onPaneDoubleClick={handlePaneDoubleClick}
        newStatePositionRef={newStatePositionRef}
        onNodeDragStop={!readOnly ? handleNodeDragStop : undefined}
        layoutKey={layoutKey}
        readOnly={readOnly}
        showMinimap={chrome?.minimap !== false && !inspectorVisible}
        showControls={chrome?.controls !== false}
        canUndo={state.undoStack.length > 0}
        canRedo={state.redoStack.length > 0}
        onUndo={!readOnly ? actions.undo : undefined}
        onRedo={!readOnly ? actions.redo : undefined}
        onAutoLayout={!readOnly ? handleAutoLayout : undefined}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        resizeKey={inspectorVisible ? 1 : 0}
        onHelp={() => setHelpOpen(true)}
        helpLabel={mergedMessages.toolbar.help}
        transitionBlockPositions={
          state.activeWorkflow
            ? state.document.meta.workflowUi[state.activeWorkflow]?.transitionPositions
            : undefined
        }
      />
      {reconnectError && (
        <div
          role="alert"
          data-testid="reconnect-error"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 20,
            maxWidth: 360,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
          }}
        >
          {reconnectError}
        </div>
      )}
      {state.activeWorkflow && (() => {
        const comments = state.document.meta.workflowUi[state.activeWorkflow!]?.comments;
        if (!comments) return null;
        return Object.values(comments).map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            disabled={readOnly}
            onUpdate={(updates) =>
              actions.dispatch({
                op: "updateComment",
                workflow: state.activeWorkflow!,
                commentId: c.id,
                updates,
              })
            }
            onRemove={() =>
              actions.dispatch({
                op: "removeComment",
                workflow: state.activeWorkflow!,
                commentId: c.id,
              })
            }
          />
        ));
      })()}
    </div>
  );

  const jsonPane = enableJsonEditor ? (
    <div
      data-testid="workflow-editor-json-pane"
      style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%" }}
    >
      <WorkflowJsonEditor
        document={state.document}
        issues={derived.issues}
        selection={state.selection}
        readOnly={readOnly}
        visible={jsonEditorVisible}
        config={jsonEditor}
        onPatch={dispatch}
        onSelectionChange={handleSelectionChange}
        onStatusChange={handleJsonStatusChange}
      />
    </div>
  ) : null;

  return (
    <I18nContext.Provider value={mergedMessages}>
     <EditorConfigContext.Provider value={editorConfig}>
      <div
        ref={editorContainerRef}
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif',
          outline: "none",
          background: "white",
          ...(layout === "fullWidth" ? { width: "100%", minHeight: 0 } : null),
          ...(isFullscreen ? { position: "fixed", inset: 0, zIndex: 9999, height: "100vh", width: "100vw" } : null),
        }}
        data-surface={surface}
        data-layout={layout}
        data-testid="workflow-editor"
        onKeyDownCapture={handleDeleteKeyDownCapture}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {chrome?.tabs !== false && showTabs && (
          <WorkflowTabs
            workflows={workflows}
            activeWorkflow={state.activeWorkflow}
            readOnly={readOnly}
            onSelect={actions.setActiveWorkflow}
            onAdd={() => {
              const newWorkflow = defaultNewWorkflow(workflows.map((w) => w.name));
              dispatch({ op: "addWorkflow", workflow: newWorkflow });
              actions.setActiveWorkflow(newWorkflow.name);
            }}
            onClose={(name) => dispatch({ op: "removeWorkflow", workflow: name })}
            onRename={(from, to) => {
              actions.dispatchTransaction({
                summary: `Rename workflow "${from}" → "${to}"`,
                patches: [{ op: "renameWorkflow", from, to }],
                inverses: [{ op: "renameWorkflow", from: to, to: from }],
                selectionAfter: null,
              });
              actions.setActiveWorkflow(to);
            }}
            dialectVersion={`v${state.document.meta.cyodaVersion ?? LATEST_CYODA_VERSION}`}
            supportedVersions={SUPPORTED_CYODA_VERSIONS}
            onVersionChange={handleVersionChange}
          />
        )}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {(enableJsonEditor && jsonEditorPlacement === "tab" || (!readOnly && graphVisible)) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 12px",
                  height: 36,
                  borderBottom: "1px solid #E2E8F0",
                  background: "white",
                }}
                data-testid="workflow-editor-surface-tabs"
              >
                {enableJsonEditor && jsonEditorPlacement === "tab" && (
                  <>
                    <SurfaceTab
                      active={activeSurface === "graph"}
                      onClick={() => setActiveSurface("graph")}
                    >
                      {mergedMessages.editorView.graph}
                    </SurfaceTab>
                    <SurfaceTab
                      active={activeSurface === "json"}
                      onClick={() => setActiveSurface("json")}
                    >
                      {mergedMessages.editorView.json}
                    </SurfaceTab>
                  </>
                )}
                <div style={{ flex: 1 }} />
                {!readOnly && activeSurface === "graph" && (
                  <button
                    type="button"
                    data-testid="canvas-add-state"
                    title="Add State (A)"
                    onClick={() => openAddStateModal()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      background: "white",
                      color: "#2563EB",
                      border: "1px solid #2563EB",
                      borderRadius: 5,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {mergedMessages.toolbar.addStateButton}
                  </button>
                )}
              </div>
            )}
            {enableJsonEditor && jsonEditorPlacement === "split" ? (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                }}
                data-testid="workflow-editor-split-view"
              >
                {graphPane}
                <div style={{ borderLeft: "1px solid #E2E8F0", minWidth: 0 }}>{jsonPane}</div>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {graphVisible ? (
                  <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
                    {graphPane}
                  </div>
                ) : null}
                {enableJsonEditor ? (
                  <div
                    style={{
                      flex: activeSurface === "json" ? 1 : undefined,
                      minHeight: 0,
                      minWidth: 0,
                      height: "100%",
                      display: activeSurface === "json" ? "block" : "none",
                    }}
                  >
                    {jsonPane}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          {inspectorVisible && (
            <>
              <div
                onMouseDown={handleInspectorResizeStart}
                style={{
                  width: 3,
                  flexShrink: 0,
                  cursor: "col-resize",
                  background: "transparent",
                  borderLeft: "1px solid #E2E8F0",
                  transition: "background 0.15s",
                  zIndex: 10,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#CBD5E1")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              />
              <Inspector
                document={state.document}
                selection={state.selection}
                issues={derived.issues}
                readOnly={readOnly}
                onDispatch={dispatch}
                onSelectionChange={handleSelectionChange}
                onClose={() => handleSelectionChange(null)}
                onRequestDeleteState={requestDeleteState}
                width={inspectorWidth}
                {...(hintProvider ? { hintProvider } : {})}
              />
            </>
          )}
        </div>
        {pendingAddState !== null && state.activeWorkflow && (
          <AddStateModal
            existingNames={Object.keys(
              state.document.session.workflows.find(
                (w) => w.name === state.activeWorkflow,
              )?.states ?? {},
            )}
            onCreate={confirmAddState}
            onCancel={() => setPendingAddState(null)}
          />
        )}
        {pendingDelete && (
          <DeleteStateModal
            document={state.document}
            workflow={pendingDelete.workflow}
            stateCode={pendingDelete.stateCode}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
        {pendingConnect && pendingConnectState && (
          <DragConnectModal
            source={pendingConnectState}
            fromState={pendingConnect.fromState}
            toState={pendingConnect.toState}
            onCreate={confirmConnect}
            onCancel={() => setPendingConnect(null)}
          />
        )}
        {helpOpen && <HelpModal onCancel={() => setHelpOpen(false)} />}
        {pendingVersionSwitch && (
          <VersionSwitchModal
            fromVersion={`v${state.document.meta.cyodaVersion ?? LATEST_CYODA_VERSION}`}
            toVersion={`v${pendingVersionSwitch.targetVersion}`}
            warnings={pendingVersionSwitch.warnings}
            onConfirm={() => {
              actions.silentReplace(pendingVersionSwitch.document, { preserveEditorState: true });
              setPendingVersionSwitch(null);
            }}
            onCancel={() => setPendingVersionSwitch(null)}
          />
        )}
        {chrome?.toolbar !== false && (
          <div style={{ position: "relative" }}>
            <Toolbar
              derived={derived}
              readOnly={readOnly}
              saveDisabled={saveDisabled}
              showSaveButton={showSaveButton}
              openIssueSeverity={openIssueSeverity}
              onSave={onSave ? () => onSave(state.document) : undefined}
              onIssueBadgeClick={(severity) =>
                setOpenIssueSeverity((prev) => (prev === severity ? null : severity))
              }
              toolbarStart={toolbarStart}
              toolbarCenter={toolbarCenter}
              toolbarEnd={toolbarEnd}
            />
            <IssuesDrawer
              open={openIssueSeverity !== null}
              severity={openIssueSeverity ?? "error"}
              issues={derived.issues}
              document={state.document}
              onClose={() => setOpenIssueSeverity(null)}
              onJumpTo={(selection) => {
                handleSelectionChange(selection);
              }}
            />
          </div>
        )}
      </div>
     </EditorConfigContext.Provider>
    </I18nContext.Provider>
  );
}

type ReconnectBuildResult =
  | { ok: true; transaction: PatchTransaction }
  | { ok: false; reason?: string };

function buildReconnectTransaction(
  doc: WorkflowEditorDocument,
  edge: Edge<RfEdgeData>,
  connection: Connection,
): ReconnectBuildResult {
  const ptr = doc.meta.ids.transitions[edge.id];
  if (!ptr) return { ok: false };
  const wf = doc.session.workflows.find((workflow) => workflow.name === ptr.workflow);
  if (!wf) return { ok: false };
  const transition = transitionForUuid(doc, edge.id);
  if (!transition) return { ok: false };

  const sourcePtr = connection.source ? doc.meta.ids.states[connection.source] : undefined;
  const targetPtr = connection.target ? doc.meta.ids.states[connection.target] : undefined;
  if (!sourcePtr || !targetPtr) return { ok: false };
  if (sourcePtr.workflow !== ptr.workflow || targetPtr.workflow !== ptr.workflow) {
    return { ok: false, reason: "Transitions can only be reconnected within the same workflow." };
  }

  const fromState = ptr.state;
  const toState = sourcePtr.state;
  const oldTarget = transition.next;
  const nextTarget = targetPtr.state;
  const sourceChanged = toState !== fromState;
  const targetChanged = nextTarget !== oldTarget;
  const priorAnchors =
    doc.meta.workflowUi[ptr.workflow]?.edgeAnchors?.[edge.id] ?? undefined;
  const nextAnchors = normalizeAnchorPair({
    ...(priorAnchors ?? {}),
    source: anchorFromHandle(connection.sourceHandle) ?? priorAnchors?.source,
    target: anchorFromHandle(connection.targetHandle) ?? priorAnchors?.target,
  });
  const anchorsChanged = !sameAnchors(priorAnchors, nextAnchors ?? undefined);

  if (!sourceChanged && !targetChanged && !anchorsChanged) return { ok: false };

  if (
    sourceChanged &&
    wf.states[toState]?.transitions.some((t) => t.name === transition.name)
  ) {
    return {
      ok: false,
      reason: `Transition "${transition.name}" already exists in state "${toState}".`,
    };
  }

  if (!sourceChanged) {
    const patches: DomainPatch[] = [];
    const inverses: DomainPatch[] = [];
    if (targetChanged) {
      patches.push({ op: "updateTransition", transitionUuid: edge.id, updates: { next: nextTarget } });
      inverses.unshift({ op: "updateTransition", transitionUuid: edge.id, updates: { next: oldTarget } });
    }
    if (anchorsChanged) {
      patches.push({ op: "setEdgeAnchors", transitionUuid: edge.id, anchors: nextAnchors });
      inverses.unshift({
        op: "setEdgeAnchors",
        transitionUuid: edge.id,
        anchors: priorAnchors ? { ...priorAnchors } : null,
      });
    }
    return {
      ok: true,
      transaction: {
        summary: `Reconnect transition "${transition.name}"`,
        patches,
        inverses,
        selectionAfter: { kind: "transition", transitionUuid: edge.id },
      },
    };
  }

  const movePatch: DomainPatch = {
    op: "moveTransitionSource",
    workflow: ptr.workflow,
    fromState,
    toState,
    transitionName: transition.name,
  };
  const afterMove = applyPatch(doc, movePatch);
  const movedUuid = transitionUuidByName(afterMove, ptr.workflow, toState, transition.name);
  if (!movedUuid) return { ok: false };

  const patches: DomainPatch[] = [movePatch];
  const inverses: DomainPatch[] = [
    {
      op: "moveTransitionSource",
      workflow: ptr.workflow,
      fromState: toState,
      toState: fromState,
      transitionName: transition.name,
    },
    {
      op: "setEdgeAnchors",
      transitionUuid: edge.id,
      anchors: priorAnchors ? { ...priorAnchors } : null,
    },
  ];

  if (targetChanged) {
    patches.push({
      op: "updateTransition",
      transitionUuid: movedUuid,
      updates: { next: nextTarget },
    });
    inverses.unshift({
      op: "updateTransition",
      transitionUuid: movedUuid,
      updates: { next: oldTarget },
    });
  }
  const shouldWriteMovedAnchors = nextAnchors !== null;
  if (shouldWriteMovedAnchors) {
    patches.push({ op: "setEdgeAnchors", transitionUuid: movedUuid, anchors: nextAnchors });
    inverses.unshift({
      op: "setEdgeAnchors",
      transitionUuid: movedUuid,
      anchors: null,
    });
  }

  return {
    ok: true,
    transaction: {
      summary: `Move transition "${transition.name}" to "${toState}"`,
      patches,
      inverses,
      selectionAfter: { kind: "transition", transitionUuid: movedUuid },
    },
  };
}

const VALID_ANCHORS: ReadonlySet<string> = new Set([
  "top-left", "top", "top-right",
  "right-top", "right", "right-bottom",
  "bottom-left", "bottom", "bottom-right",
  "left-top", "left", "left-bottom",
] as const);

function anchorFromHandle(handle: string | null | undefined): EdgeAnchor | undefined {
  return handle && VALID_ANCHORS.has(handle) ? (handle as EdgeAnchor) : undefined;
}

function normalizeAnchorPair(anchors: EdgeAnchorPair): EdgeAnchorPair | null {
  const out: EdgeAnchorPair = {};
  if (anchors.source) out.source = anchors.source;
  if (anchors.target) out.target = anchors.target;
  return out.source || out.target ? out : null;
}

function sameAnchors(a: EdgeAnchorPair | undefined, b: EdgeAnchorPair | undefined): boolean {
  return a?.source === b?.source && a?.target === b?.target;
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "workflow":
      return b.kind === "workflow" && a.workflow === b.workflow;
    case "state":
      return b.kind === "state" &&
        a.workflow === b.workflow &&
        a.stateCode === b.stateCode &&
        a.nodeId === b.nodeId;
    case "transition":
      return b.kind === "transition" && a.transitionUuid === b.transitionUuid;
    case "processor":
      return b.kind === "processor" && a.processorUuid === b.processorUuid;
    case "criterion":
      return b.kind === "criterion" &&
        a.hostKind === b.hostKind &&
        a.hostId === b.hostId &&
        a.path.length === b.path.length &&
        a.path.every((part, index) => part === b.path[index]);
  }
}

function workflowForSelection(
  doc: WorkflowEditorDocument,
  selection: Selection,
): string | null {
  if (!selection) return null;
  if (selection.kind === "workflow" || selection.kind === "state") return selection.workflow;
  if (selection.kind === "transition") {
    return doc.meta.ids.transitions[selection.transitionUuid]?.workflow ?? null;
  }
  if (selection.kind === "processor") {
    return doc.meta.ids.processors[selection.processorUuid]?.workflow ?? null;
  }
  if (selection.hostKind === "workflow") {
    const workflow = Object.entries(doc.meta.ids.workflows).find(
      ([, workflowId]) => workflowId === selection.hostId,
    );
    return workflow?.[0] ?? null;
  }
  return doc.meta.ids.transitions[selection.hostId]?.workflow ?? null;
}

function SurfaceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "#0F172A" : "#CBD5E1"}`,
        background: active ? "#0F172A" : "white",
        color: active ? "white" : "#0F172A",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function transitionForUuid(doc: WorkflowEditorDocument, uuid: string) {
  const loc = transitionLocation(doc, uuid);
  if (!loc) return undefined;
  const wf = doc.session.workflows.find((workflow) => workflow.name === loc.workflow);
  return wf?.states[loc.state]?.transitions[loc.index];
}

function transitionLocation(
  doc: WorkflowEditorDocument,
  uuid: string,
): { workflow: string; state: string; index: number } | null {
  const ptr = doc.meta.ids.transitions[uuid];
  if (!ptr) return null;
  const ordered = Object.entries(doc.meta.ids.transitions)
    .filter(([, candidate]) => candidate.workflow === ptr.workflow && candidate.state === ptr.state)
    .map(([candidateUuid]) => candidateUuid);
  const index = ordered.indexOf(uuid);
  return index >= 0 ? { workflow: ptr.workflow, state: ptr.state, index } : null;
}

function transitionUuidByName(
  doc: WorkflowEditorDocument,
  workflow: string,
  state: string,
  transitionName: string,
): string | null {
  const wf = doc.session.workflows.find((candidate) => candidate.name === workflow);
  const transitions = wf?.states[state]?.transitions ?? [];
  const index = transitions.findIndex((transition) => transition.name === transitionName);
  if (index < 0) return null;
  const ordered = Object.entries(doc.meta.ids.transitions)
    .filter(([, ptr]) => ptr.workflow === workflow && ptr.state === state)
    .map(([uuid]) => uuid);
  return ordered[index] ?? null;
}

function normalizeViewport(viewport: EditorViewport): EditorViewport {
  return {
    x: Math.round(viewport.x * 100) / 100,
    y: Math.round(viewport.y * 100) / 100,
    zoom: Math.round(viewport.zoom * 1000) / 1000,
  };
}

function sameViewport(a: EditorViewport, b: EditorViewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

function snapToGrid(value: number, grid = 16): number {
  return Math.round(value / grid) * grid;
}
