import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EditorLike,
  LiftResult,
  MonacoLike,
  TextModelLike,
} from "@cyoda/workflow-monaco";
import {
  attachCursorSelectionBridge,
  attachWorkflowJsonController,
  registerWorkflowSchema,
  revealIdInEditor,
} from "@cyoda/workflow-monaco";
import type {
  DomainPatch,
  ValidationIssue,
  WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import type { Selection } from "../state/types.js";

// Monaco's editor.dispose() cancels internal async operations which produce
// "Canceled" unhandled promise rejections. This is a Monaco-internal issue
// that surfaces in React StrictMode's double-invoke cleanup. We suppress it
// via a module-level handler (so it survives React's effect lifecycle) that
// is only active during the brief disposal window.
let _monacoDisposalCount = 0;
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    if (
      _monacoDisposalCount > 0 &&
      (e.reason?.name === "Canceled" || String(e.reason).startsWith("Canceled"))
    ) {
      e.preventDefault();
    }
  });
}

export type JsonEditStatus = LiftResult | { status: "idle" };

export interface MonacoUriLike {
  toString(): string;
}

export interface WorkflowJsonModelLike extends TextModelLike {
  dispose(): void;
}

export interface WorkflowJsonEditorInstance extends EditorLike {
  dispose(): void;
  layout?: () => void;
  updateOptions?: (options: Record<string, unknown>) => void;
}

export interface WorkflowJsonMonacoRuntime extends MonacoLike {
  Uri: {
    parse(value: string): MonacoUriLike;
  };
  editor: MonacoLike["editor"] & {
    createModel(
      value: string,
      language?: string,
      uri?: MonacoUriLike,
    ): WorkflowJsonModelLike;
    create(
      element: HTMLElement,
      options: Record<string, unknown>,
    ): WorkflowJsonEditorInstance;
  };
}

export interface WorkflowJsonEditorConfig {
  monaco: WorkflowJsonMonacoRuntime;
  modelUri?: string;
  editorOptions?: Record<string, unknown>;
  debounceMs?: number;
}

export interface WorkflowJsonEditorProps {
  document: WorkflowEditorDocument;
  issues: ValidationIssue[];
  selection: Selection;
  readOnly: boolean;
  visible: boolean;
  config: WorkflowJsonEditorConfig | null;
  onPatch: (patch: DomainPatch) => void;
  onSelectionChange: (selection: Selection) => void;
  onStatusChange?: (status: JsonEditStatus) => void;
}

export function WorkflowJsonEditor({
  document,
  issues,
  selection,
  readOnly,
  visible,
  config,
  onPatch,
  onSelectionChange,
  onStatusChange,
}: WorkflowJsonEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef(document);
  const issuesRef = useRef(issues);
  const readOnlyRef = useRef(readOnly);
  const onPatchRef = useRef(onPatch);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const editorRef = useRef<WorkflowJsonEditorInstance | null>(null);
  const controllerRef = useRef<ReturnType<typeof attachWorkflowJsonController> | null>(null);
  const schemaHandleRef = useRef<ReturnType<typeof registerWorkflowSchema> | null>(null);
  const cursorBridgeRef = useRef<{ dispose(): void } | null>(null);
  const applyingGraphSelectionRef = useRef(false);
  const visibleRef = useRef(visible);
  const [status, setStatus] = useState<JsonEditStatus>({ status: "idle" });

  documentRef.current = document;
  issuesRef.current = issues;
  readOnlyRef.current = readOnly;
  visibleRef.current = visible;
  onPatchRef.current = onPatch;
  onSelectionChangeRef.current = onSelectionChange;
  onStatusChangeRef.current = onStatusChange;

  const selectedId = useMemo(
    () => selectionToJsonId(document, selection),
    [document, selection],
  );
  const monaco = config?.monaco;
  const modelUri = config?.modelUri;
  const editorOptions = config?.editorOptions;
  const debounceMs = config?.debounceMs;

  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return;
    const model = monaco.editor.createModel(
      "",
      "json",
      monaco.Uri.parse(modelUri ?? "cyoda://workflow/editor.json"),
    );
    const editor = monaco.editor.create(containerRef.current, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      theme: "vs",
      ...editorOptions,
      readOnly: readOnlyRef.current,
    });

    editorRef.current = editor;
    schemaHandleRef.current = registerWorkflowSchema(monaco);
    controllerRef.current = attachWorkflowJsonController({
      monaco,
      editor,
      debounceMs,
      autoApply: true,
      onPatch: (patch) => onPatchRef.current(patch),
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
        onStatusChangeRef.current?.(nextStatus);
      },
    });
    cursorBridgeRef.current = attachCursorSelectionBridge(
      editor,
      () => documentRef.current,
      (id) => {
        if (applyingGraphSelectionRef.current) return;
        if (!visibleRef.current) return;
        onSelectionChangeRef.current(selectionFromJsonId(documentRef.current, id));
      },
    );
    controllerRef.current.syncFromDocument(documentRef.current);
    controllerRef.current.renderIssues(issuesRef.current, documentRef.current);

    return () => {
      _monacoDisposalCount++;
      window.setTimeout(() => { _monacoDisposalCount--; }, 100);

      cursorBridgeRef.current?.dispose();
      cursorBridgeRef.current = null;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      schemaHandleRef.current?.dispose();
      schemaHandleRef.current = null;
      editor.dispose();
      editorRef.current = null;
      model.dispose();
    };
  }, [monaco, modelUri]);

  useEffect(() => {
    const editor = editorRef.current;
    const controller = controllerRef.current;
    if (!editor || !controller || !config) return;
    editor.updateOptions?.({ readOnly });
    controller.syncFromDocument(document);
    controller.renderIssues(issues, document);
  }, [config, document, issues, readOnly]);

  useEffect(() => {
    if (!visible) return;
    editorRef.current?.layout?.();
  }, [visible]);

  useEffect(() => {
    if (!config) {
      setStatus({ status: "idle" });
      onStatusChangeRef.current?.({ status: "idle" });
    }
  }, [config]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !visible || !selectedId) return;
    applyingGraphSelectionRef.current = true;
    revealIdInEditor(editor, document, selectedId);
    const timeout = window.setTimeout(() => {
      applyingGraphSelectionRef.current = false;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [document, selectedId, visible]);

  if (!config) {
    return (
      <div
        data-testid="workflow-json-unavailable"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: "#475569",
          fontSize: 14,
          textAlign: "center",
          background: "#F8FAFC",
        }}
      >
        <UnavailableMessage />
      </div>
    );
  }

  return (
    <div
      data-testid="workflow-json-editor"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "white",
        minHeight: 0,
      }}
    >
      <JsonStatusBanner status={status} />
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, borderTop: "1px solid #E2E8F0" }}
      />
    </div>
  );
}

function UnavailableMessage() {
  const messages = useMessages();
  return <>{messages.editorView.unavailable}</>;
}

function JsonStatusBanner({ status }: { status: JsonEditStatus }) {
  const messages = useMessages();
  if (
    status.status === "idle" ||
    status.status === "ok" ||
    status.status === "unchanged"
  ) {
    return null;
  }

  const tone =
    status.status === "semantic-errors"
      ? { border: "#FCD34D", bg: "#FFFBEB", text: "#92400E" }
      : { border: "#FCA5A5", bg: "#FEF2F2", text: "#991B1B" };
  const body =
    status.status === "semantic-errors"
      ? messages.editorView.semanticErrors
      : status.status === "invalid-schema"
        ? messages.editorView.invalidSchema
        : `${messages.editorView.invalidJson}${status.message ? ` ${status.message}` : ""}`;

  return (
    <div
      role="status"
      data-testid="workflow-json-status"
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: 12,
      }}
    >
      {body}
    </div>
  );
}

function selectionToJsonId(
  doc: WorkflowEditorDocument,
  selection: Selection,
): string | null {
  if (!selection) return null;
  if (selection.kind === "workflow") return doc.meta.ids.workflows[selection.workflow] ?? null;
  if (selection.kind === "state") return selection.nodeId;
  if (selection.kind === "transition") return selection.transitionUuid;
  if (selection.kind === "processor") return selection.processorUuid;
  return selection.hostId;
}

function selectionFromJsonId(
  doc: WorkflowEditorDocument,
  id: string | null,
): Selection {
  if (!id) return null;
  for (const [workflowName, workflowId] of Object.entries(doc.meta.ids.workflows)) {
    if (workflowId === id) return { kind: "workflow", workflow: workflowName };
  }
  const statePtr = doc.meta.ids.states[id];
  if (statePtr) {
    return {
      kind: "state",
      workflow: statePtr.workflow,
      stateCode: statePtr.state,
      nodeId: id,
    };
  }
  if (doc.meta.ids.transitions[id]) return { kind: "transition", transitionUuid: id };
  if (doc.meta.ids.processors[id]) return { kind: "processor", processorUuid: id };
  return null;
}
