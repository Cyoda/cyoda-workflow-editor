import { useMemo, useState } from "react";
import { WorkflowEditor, type ChromeOptions } from "@cyoda/workflow-react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { DocumentStats, FixtureSelector, JsonBlock, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { getMonacoRuntime } from "../lib/monacoRuntime.js";
import { loadFixture, serializeDocument } from "../lib/workflowDemo.js";

type EditorModeOption = "viewer" | "playground" | "editor";
type JsonPlacement = "tab" | "split";

const chromeKeys: Array<keyof ChromeOptions> = ["toolbar", "tabs", "inspector", "minimap", "controls"];

export function EditorShowcasePage() {
  const monaco = useMemo(() => getMonacoRuntime(), []);
  const fixtures = fixturesFor("editor");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const [mode, setMode] = useState<EditorModeOption>("editor");
  const [docVersion, setDocVersion] = useState(0);
  const [jsonPlacement, setJsonPlacement] = useState<JsonPlacement>("tab");
  const [chrome, setChrome] = useState<ChromeOptions>({
    toolbar: true,
    tabs: true,
    inspector: true,
    minimap: true,
    controls: true,
  });

  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0];
  const loaded = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const initialDocument = loaded?.document ?? null;
  const [currentDocument, setCurrentDocument] = useState<WorkflowEditorDocument | null>(initialDocument);

  const resetDocument = () => {
    setCurrentDocument(initialDocument);
    setDocVersion((value) => value + 1);
  };

  const handleFixtureChange = (slug: string) => {
    const fixture = fixtureBySlug(slug);
    if (!fixture) return;
    const nextLoad = loadFixture(fixture);
    setSelectedSlug(slug);
    setCurrentDocument(nextLoad.document);
    setDocVersion((value) => value + 1);
  };

  if (!selectedFixture || !loaded || !initialDocument || !currentDocument) {
    return (
      <section className="page-section">
        <PageIntro
          eyebrow="Editor showcase"
          title="Workflow editor shell"
          description="No editor fixture could be loaded."
        />
      </section>
    );
  }

  return (
    <section className="page-section" data-testid="editor-page">
      <PageIntro
        eyebrow="Editor showcase"
        title="WorkflowEditor — full editing surface"
        description="Exercise every editing capability: add/rename/delete states (toolbar or A key), drag-connect transitions, edit criteria (simple/group/function/lifecycle/array), edit OpenAPI-backed externalized and scheduled processors in modal drafts, drag states to persist layout, add canvas comments, and verify undo/redo. The exported JSON panel at the bottom proves that layout positions and comments are never written to Cyoda workflow JSON."
      />

      <FixtureSelector fixtures={fixtures} selectedSlug={selectedSlug} onSelect={handleFixtureChange} />
      <DocumentStats
        fixture={selectedFixture}
        document={currentDocument}
        issues={loaded.issues}
        extra={[
          { label: "Mode", value: mode },
          {
            label: "Chrome enabled",
            value: chromeKeys.filter((key) => chrome[key] !== false).length,
          },
          { label: "JSON view", value: jsonPlacement },
        ]}
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Editor controls</h2>
            <p className="muted-text">Switch modes, trim chrome, and reset the editor state to the selected fixture.</p>
          </div>
          <div className="panel-actions">
            <select value={mode} onChange={(event) => setMode(event.target.value as EditorModeOption)} className="control-select">
              <option value="viewer">viewer</option>
              <option value="playground">playground</option>
              <option value="editor">editor</option>
            </select>
            <select
              value={jsonPlacement}
              onChange={(event) => setJsonPlacement(event.target.value as JsonPlacement)}
              className="control-select"
            >
              <option value="tab">graph/json tabs</option>
              <option value="split">split graph + json</option>
            </select>
            <button type="button" className="action-button" onClick={resetDocument}>
              Reset editor state
            </button>
          </div>
        </div>
        <div className="chrome-toggle-grid">
          {chromeKeys.map((key) => (
            <label key={key} className="check-label">
              <input
                type="checkbox"
                checked={chrome[key] !== false}
                onChange={(event) =>
                  setChrome((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
              <span>{key}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Workflow editor</h2>
            <p className="muted-text">The canvas is mounted inside a fixed-height shell to make interactions and screenshots stable.</p>
            <p className="muted-text">
              Try selecting a transition, changing its source/target anchor dropdowns,
              or dragging an edge endpoint to another handle/state. The exported JSON
              below should only change for real source/target state changes; visual
              anchors remain editor metadata.
            </p>
          </div>
        </div>
        <div className="editor-shell" data-testid="workflow-editor-shell">
          <WorkflowEditor
            key={`${selectedFixture.slug}-${mode}-${jsonPlacement}-${docVersion}`}
            document={currentDocument}
            mode={mode}
            chrome={chrome}
            enableJsonEditor
            jsonEditorPlacement={jsonPlacement}
            jsonEditor={{ monaco, modelUri: `cyoda://editor-showcase/${selectedFixture.slug}.json` }}
            onChange={setCurrentDocument}
            onSave={() => {}}
            developerMode
          />
        </div>
      </section>

      <JsonBlock
        title="Exported Cyoda workflow JSON (no layout, no comments)"
        text={serializeDocument(currentDocument)}
      />
    </section>
  );
}
