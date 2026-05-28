import { useMemo, useState } from "react";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "@cyoda/workflow-viewer";
import { DocumentStats, FixtureSelector, IssuesPanel, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { loadFixture, parseWorkflowText } from "../lib/workflowDemo.js";

export function ViewerPlaygroundPage() {
  const fixtures = fixturesFor("viewer");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0];
  const initialLoad = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const [draftJson, setDraftJson] = useState(initialLoad?.text ?? "");
  const [renderState, setRenderState] = useState(initialLoad);
  const [draftIssues, setDraftIssues] = useState(initialLoad?.issues ?? []);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  if (!selectedFixture || !renderState) {
    return (
      <section className="page-section">
        <PageIntro
          eyebrow="Viewer playground"
          title="Workflow viewer fixtures"
          description="No fixtures are configured for the viewer playground."
        />
      </section>
    );
  }

  const graph = renderState.document ? projectToGraph(renderState.document) : null;
  const hasDraftChanges = draftJson !== renderState.text;

  const handleFixtureChange = (slug: string) => {
    const fixture = fixtureBySlug(slug);
    if (!fixture) return;
    const nextLoad = loadFixture(fixture);
    setSelectedSlug(slug);
    setDraftJson(nextLoad.text);
    setRenderState(nextLoad);
    setDraftIssues(nextLoad.issues);
    setSelectedGraphId(null);
    setApplyError(null);
  };

  const handleReset = () => {
    setDraftJson(renderState.text);
    setDraftIssues(renderState.issues);
    setApplyError(null);
  };

  const handleApply = () => {
    const nextParse = parseWorkflowText(draftJson, renderState.document?.meta);
    setDraftIssues(nextParse.issues);
    if (!nextParse.document) {
      setApplyError("The JSON is not renderable yet. The viewer is still showing the last valid workflow.");
      return;
    }
    setRenderState({
      fixture: selectedFixture,
      text: draftJson,
      document: nextParse.document,
      issues: nextParse.issues,
    });
    setSelectedGraphId(null);
    setApplyError(null);
  };

  return (
    <section className="page-section" data-testid="viewer-page">
      <PageIntro
        eyebrow="Viewer playground"
        title="Parse, validate, project, and render fixtures"
        description="This route intentionally keeps the workflow viewer path front and center while exposing enough JSON and issue detail to make debugging projection problems easy."
      />

      <FixtureSelector fixtures={fixtures} selectedSlug={selectedSlug} onSelect={handleFixtureChange} />

      {renderState.document && (
        <DocumentStats
          fixture={selectedFixture}
          document={renderState.document}
          issues={renderState.issues}
          extra={[{ label: "Selected graph id", value: selectedGraphId ?? "none" }]}
        />
      )}

      <div className="playground-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Rendered workflow</h2>
              <p className="muted-text">
                Powered by `@cyoda/workflow-core`, `@cyoda/workflow-graph`, and
                `@cyoda/workflow-viewer`.
              </p>
            </div>
          </div>
          {graph ? (
            <div className="viewer-card viewer-card--playground">
              <WorkflowViewer graph={graph} onSelectionChange={setSelectedGraphId} />
            </div>
          ) : (
            <div className="status-card status-card--error">
              <strong>Rendered graph unavailable</strong>
              <p>This fixture currently does not parse into a valid workflow document.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading panel-heading--stacked">
            <div>
              <h2>Import payload JSON</h2>
              <p className="muted-text">
                Edit the raw payload directly, then apply when you want to update the projected
                graph.
              </p>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="action-button"
                onClick={handleReset}
                disabled={!hasDraftChanges}
              >
                Reset draft
              </button>
              <button type="button" className="action-button action-button--primary" onClick={handleApply}>
                Apply JSON
              </button>
            </div>
          </div>
          <textarea
            className="json-editor"
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            spellCheck={false}
          />
          {applyError ? (
            <div className="status-card status-card--error">
              <strong>Apply failed</strong>
              <p>{applyError}</p>
            </div>
          ) : (
            <div className="status-card">
              <strong>Draft status</strong>
              <p>{hasDraftChanges ? "Draft has unapplied changes." : "Draft matches the rendered workflow."}</p>
            </div>
          )}
          <IssuesPanel issues={draftIssues} />
        </section>
      </div>
    </section>
  );
}
