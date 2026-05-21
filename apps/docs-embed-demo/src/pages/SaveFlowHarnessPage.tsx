import { useMemo, useState } from "react";
import {
  WorkflowApiConflictError,
  applyPatch,
  type ConcurrencyToken,
  type EntityIdentity,
  type ImportPayload,
  type ImportResult,
  type ValidationIssue,
  type WorkflowApi,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { WorkflowEditor, ConflictBanner, SaveConfirmModal, diffSummary, useSaveFlow } from "@cyoda/workflow-react";
import { DocumentStats, FixtureSelector, JsonBlock, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { loadFixture, serializeDocument } from "../lib/workflowDemo.js";

type SaveScenario = "success" | "conflict" | "server-error";
type ImportModeOption = "MERGE" | "REPLACE" | "ACTIVATE";

const demoEntity: EntityIdentity = {
  entityName: "TradeInstruction",
  modelVersion: 7,
};

function withEntity(document: WorkflowEditorDocument, mode: ImportModeOption) {
  return applyPatch(
    applyPatch(document, { op: "setEntity", entity: demoEntity }),
    { op: "setImportMode", mode },
  );
}

function createDemoApi(
  scenario: SaveScenario,
  nextServerToken: string,
  _setServerSnapshot: (payload: ImportPayload, token: string) => void,
): WorkflowApi {
  return {
    async exportWorkflows(entity) {
      return {
        payload: {
          entityName: entity.entityName,
          modelVersion: entity.modelVersion,
          workflows: [],
        },
        concurrencyToken: nextServerToken,
      };
    },
    async importWorkflows(entity, _payload, opts): Promise<ImportResult> {
      if (scenario === "server-error") {
        throw new Error("Simulated transport failure from save-flow harness.");
      }
      if (scenario === "conflict" && opts?.concurrencyToken !== null) {
        throw new WorkflowApiConflictError(entity, `${nextServerToken}-remote`);
      }
      return { concurrencyToken: `${nextServerToken}-saved` };
    },
  };
}

function SaveFlowDemo({
  document,
  serverDocument,
  scenario,
  concurrencyToken,
  warningCount,
  onSaved,
  onReload,
}: {
  document: WorkflowEditorDocument;
  serverDocument: WorkflowEditorDocument | null;
  scenario: SaveScenario;
  concurrencyToken: ConcurrencyToken | null;
  warningCount: number;
  onSaved: (doc: WorkflowEditorDocument, token: ConcurrencyToken | null) => void;
  onReload: () => void;
}) {
  const api = useMemo(
    () => createDemoApi(scenario, "token-2", () => {}),
    [scenario],
  );

  const save = useSaveFlow({
    api,
    document,
    concurrencyToken,
    onSaved: (nextToken) => onSaved(document, nextToken),
    onReload,
  });

  const summary = diffSummary(serverDocument, document);

  return (
    <>
      {save.status.kind === "conflict" && (
        <ConflictBanner onReload={save.reload} onForceOverwrite={() => void save.forceOverwrite()} />
      )}
      <div className="panel-actions">
        <button type="button" className="action-button action-button--primary" onClick={save.requestSave}>
          Request save
        </button>
        <button type="button" className="action-button" onClick={save.clear}>
          Clear status
        </button>
      </div>
      <div className="status-card">
        <strong>Save status</strong>
        <p>{save.status.kind}</p>
      </div>
      {save.status.kind === "confirming" && (
        <SaveConfirmModal
          mode={save.status.mode}
          requiresExplicitConfirm={save.status.requiresExplicitConfirm}
          warningCount={warningCount}
          document={document}
          diffSummary={summary}
          onCancel={save.cancel}
          onConfirm={() => void save.confirmSave()}
        />
      )}
    </>
  );
}

export function SaveFlowHarnessPage() {
  const fixtures = fixturesFor("save");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const [scenario, setScenario] = useState<SaveScenario>("success");
  const [mode, setMode] = useState<ImportModeOption>("REPLACE");
  const [editorKey, setEditorKey] = useState(0);
  const [concurrencyToken, setConcurrencyToken] = useState<ConcurrencyToken | null>("token-1");

  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0];
  const loaded = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const seededDocument = loaded?.document ? withEntity(loaded.document, mode) : null;
  const [currentDocument, setCurrentDocument] = useState<WorkflowEditorDocument | null>(seededDocument);
  const [fixtureIssues, setFixtureIssues] = useState<ValidationIssue[]>(loaded?.issues ?? []);
  const [serverDocument, setServerDocument] = useState<WorkflowEditorDocument | null>(seededDocument);

  const resetHarness = (nextFixtureSlug = selectedSlug, nextMode = mode) => {
    const fixture = fixtureBySlug(nextFixtureSlug);
    if (!fixture) return;
    const nextLoad = loadFixture(fixture);
    const nextDoc = nextLoad.document ? withEntity(nextLoad.document, nextMode) : null;
    setCurrentDocument(nextDoc);
    setFixtureIssues(nextLoad.issues);
    setServerDocument(nextDoc);
    setConcurrencyToken("token-1");
    setEditorKey((value) => value + 1);
  };

  if (!selectedFixture || !loaded || !seededDocument || !currentDocument) {
    return (
      <section className="page-section">
        <PageIntro
          eyebrow="Save-flow harness"
          title="Workflow save simulation"
          description="No save fixture could be loaded."
        />
      </section>
    );
  }

  return (
    <section className="page-section" data-testid="save-flow-page">
      <PageIntro
        eyebrow="Save-flow harness"
        title="Confirmation, diff, and conflict behavior"
        description="This route simulates the backend-facing save state machine with deterministic success, conflict, and transport-failure branches, while still letting the editor mutate the canonical document."
      />

      <FixtureSelector
        fixtures={fixtures}
        selectedSlug={selectedSlug}
        onSelect={(slug) => {
          setSelectedSlug(slug);
          resetHarness(slug, mode);
        }}
      />
      <DocumentStats
        fixture={selectedFixture}
        document={currentDocument}
        issues={fixtureIssues}
        extra={[
          { label: "Import mode", value: mode },
          { label: "Scenario", value: scenario },
          { label: "Token", value: concurrencyToken ?? "null" },
        ]}
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Harness controls</h2>
            <p className="muted-text">Switch import mode and backend behavior without leaving the route.</p>
          </div>
          <div className="panel-actions">
            <select
              value={mode}
              onChange={(event) => {
                const nextMode = event.target.value as ImportModeOption;
                setMode(nextMode);
                resetHarness(selectedSlug, nextMode);
              }}
              className="control-select"
            >
              <option value="MERGE">MERGE</option>
              <option value="REPLACE">REPLACE</option>
              <option value="ACTIVATE">ACTIVATE</option>
            </select>
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value as SaveScenario)}
              className="control-select"
            >
              <option value="success">success</option>
              <option value="conflict">conflict</option>
              <option value="server-error">server-error</option>
            </select>
            <button type="button" className="action-button" onClick={() => resetHarness()}>
              Reset harness
            </button>
          </div>
        </div>
      </section>

      <div className="playground-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Editable workflow</h2>
              <p className="muted-text">Edit the workflow here, then trigger the save harness controls alongside it.</p>
            </div>
          </div>
          <div className="editor-shell" data-testid="save-flow-editor-shell">
            <WorkflowEditor
              key={`${selectedFixture.slug}-${mode}-${editorKey}`}
              document={currentDocument}
              mode="editor"
              onChange={setCurrentDocument}
              developerMode
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Save flow state machine</h2>
              <p className="muted-text">Conflict and modal components are rendered exactly as the public package exports them.</p>
            </div>
          </div>
          <SaveFlowDemo
            document={currentDocument}
            serverDocument={serverDocument}
            scenario={scenario}
            concurrencyToken={concurrencyToken}
            warningCount={fixtureIssues.filter((issue) => issue.severity === "warning").length}
            onSaved={(doc, token) => {
              setServerDocument(doc);
              setCurrentDocument(doc);
              setConcurrencyToken(token);
            }}
            onReload={() => {
              if (!serverDocument) return;
              setCurrentDocument(serverDocument);
              setEditorKey((value) => value + 1);
            }}
          />
        </section>
      </div>

      <div className="dual-view-grid">
        <JsonBlock title="Server snapshot" text={serverDocument ? serializeDocument(serverDocument) : "null"} />
        <JsonBlock title="Editor snapshot" text={serializeDocument(currentDocument)} />
      </div>
    </section>
  );
}
