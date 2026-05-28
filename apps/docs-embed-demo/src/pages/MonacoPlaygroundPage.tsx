import { useEffect, useMemo, useRef, useState } from "react";
import { applyPatch, type ValidationIssue, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-react";
import {
  attachCursorSelectionBridge,
  attachWorkflowJsonController,
  registerWorkflowSchema,
  revealIdInEditor,
  type LiftResult,
} from "@cyoda/workflow-monaco";
import { WorkflowViewer } from "@cyoda/workflow-viewer";
import { DocumentStats, FixtureSelector, IssuesPanel, JsonBlock, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { getMonacoRuntime } from "../lib/monacoRuntime.js";
import { loadFixture, serializeDocument } from "../lib/workflowDemo.js";

export function MonacoPlaygroundPage() {
  const monaco = useMemo(() => getMonacoRuntime(), []);
  const fixtures = fixturesFor("monaco");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0] ?? null;
  const loaded = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const initialDocument = loaded?.document ?? null;
  const [document, setDocument] = useState<WorkflowEditorDocument | null>(initialDocument);
  const [issues, setIssues] = useState<ValidationIssue[]>(loaded?.issues ?? []);
  const [liftResult, setLiftResult] = useState<LiftResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef<WorkflowEditorDocument | null>(initialDocument);
  const editorRef = useRef<ReturnType<WorkflowJsonMonacoRuntime["editor"]["create"]> | null>(null);
  const controllerRef = useRef<ReturnType<typeof attachWorkflowJsonController> | null>(null);
  const schemaHandleRef = useRef<ReturnType<typeof registerWorkflowSchema> | null>(null);
  const cursorBridgeRef = useRef<{ dispose(): void } | null>(null);
  const isApplyingGraphSelection = useRef(false);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    if (!selectedFixture) return;
    if (!containerRef.current || editorRef.current) return;

    schemaHandleRef.current = registerWorkflowSchema(monaco);
    const model = monaco.editor.createModel(
      loaded?.text ?? "{\n  \"importMode\": \"MERGE\",\n  \"workflows\": []\n}\n",
      "json",
      monaco.Uri.parse(`cyoda://workflow/${selectedFixture.slug}.json`),
    );

    const editor = monaco.editor.create(containerRef.current, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      theme: "vs",
    });
    editorRef.current = editor;

    controllerRef.current = attachWorkflowJsonController({
      monaco,
      editor,
      autoApply: true,
      onPatch: (patch) => {
        setDocument((current) => {
          if (!current) return current;
          return applyPatch(current, patch);
        });
      },
      onStatus: (result) => setLiftResult(result),
      onIssues: (nextIssues) => setIssues(nextIssues),
    });

    cursorBridgeRef.current = attachCursorSelectionBridge(
      editor,
      () => documentRef.current,
      (id) => {
        if (isApplyingGraphSelection.current) return;
        setSelectedId(id);
      },
    );

    return () => {
      cursorBridgeRef.current?.dispose();
      controllerRef.current?.dispose();
      editor.dispose();
      model.dispose();
      schemaHandleRef.current?.dispose();
    };
  }, [initialDocument, loaded?.text, monaco, selectedFixture]);

  useEffect(() => {
    if (!controllerRef.current) return;
    if (!document) return;
    controllerRef.current.syncFromDocument(document);
    controllerRef.current.renderIssues(issues, document);
  }, [document, issues]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !document || !selectedId) return;
    isApplyingGraphSelection.current = true;
    revealIdInEditor(editor, document, selectedId);
    const timeout = window.setTimeout(() => {
      isApplyingGraphSelection.current = false;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [document, selectedId]);

  useEffect(() => {
    if (!editorRef.current) return;
    const nextFixture = fixtureBySlug(selectedSlug);
    if (!nextFixture) return;
    const nextLoad = loadFixture(nextFixture);
    const model = editorRef.current.getModel();
    if (model) {
      model.setValue(nextLoad.text);
    }
    setDocument(nextLoad.document);
    setIssues(nextLoad.issues);
    setLiftResult(null);
    setSelectedId(null);
  }, [selectedSlug]);

  const graph = useMemo(() => (document ? projectToGraph(document) : null), [document]);

  const handleApplyNow = () => {
    const result = controllerRef.current?.apply() ?? null;
    if (result) setLiftResult(result);
  };

  if (!selectedFixture || !loaded) {
    return (
      <section className="page-section" data-testid="monaco-page">
        <PageIntro
          eyebrow="Monaco playground"
          title="JSON schema, markers, and selection bridging"
          description="No Monaco fixture could be loaded."
        />
      </section>
    );
  }

  return (
    <section className="page-section" data-testid="monaco-page">
      <PageIntro
        eyebrow="Monaco playground"
        title="JSON schema, markers, and selection bridging"
        description="This page wires a real Monaco editor to the workflow JSON controller so the package can prove schema registration, patch lifting, stable UUID reuse, marker rendering, and graph-to-editor selection synchronization."
      />

      <FixtureSelector fixtures={fixtures} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />

      {document && (
        <DocumentStats
          fixture={selectedFixture}
          document={document}
          issues={issues}
          extra={[
            { label: "Lift status", value: liftResult?.status ?? "idle" },
            { label: "Selected id", value: selectedId ?? "none" },
          ]}
        />
      )}

      <div className="playground-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Monaco editor</h2>
              <p className="muted-text">`registerWorkflowSchema` + `attachWorkflowJsonController` are active here.</p>
            </div>
            <div className="panel-actions">
              <button type="button" className="action-button action-button--primary" onClick={handleApplyNow}>
                Apply immediately
              </button>
            </div>
          </div>
          <div ref={containerRef} className="monaco-host" />
          <IssuesPanel issues={issues} />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Projected graph</h2>
              <p className="muted-text">Selections made in the viewer will reveal the matching JSON range in Monaco.</p>
            </div>
          </div>
          {graph ? (
            <div className="viewer-card viewer-card--playground">
              <WorkflowViewer
                graph={graph}
                selectedId={selectedId ?? undefined}
                onSelectionChange={setSelectedId}
              />
            </div>
          ) : (
            <div className="status-card status-card--error">
              <strong>Last valid document unavailable</strong>
              <p>Invalid JSON and schema errors leave the previous canonical document untouched.</p>
            </div>
          )}
        </section>
      </div>

      <div className="dual-view-grid">
        <JsonBlock title="Latest lift result" text={JSON.stringify(liftResult, null, 2)} />
        <JsonBlock title="Canonical document" text={document ? serializeDocument(document) : "null"} />
      </div>
    </section>
  );
}
