import { useMemo, useState } from "react";
import type { ValidationIssue, WorkflowEditorDocument } from "@cyoda/workflow-core";
import { ParseJsonError, parseImportPayload, prettyStringify } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "@cyoda/workflow-viewer";
import { workflowExamples, type WorkflowExample } from "../examples/workflowExamples.js";

interface ParsedWorkflowState {
  document: WorkflowEditorDocument | null;
  issues: ValidationIssue[];
}

interface LoadedWorkflowExample extends ParsedWorkflowState {
  text: string;
}

function buildWorkflowPayload(rawJson: string): string {
  const parsed = JSON.parse(rawJson);
  if (parsed && typeof parsed === "object" && "workflows" in parsed) {
    return prettyStringify(parsed);
  }

  return prettyStringify({
    importMode: "MERGE",
    workflows: [parsed],
  });
}

function parseWorkflowText(text: string): ParsedWorkflowState {
  try {
    const parsed = parseImportPayload(text);
    return {
      document: parsed.document ?? null,
      issues: parsed.issues ?? [],
    };
  } catch (error) {
    if (error instanceof ParseJsonError) {
      return {
        document: null,
        issues: [
          {
            severity: "error",
            code: "invalid-json",
            message: error.message,
          },
        ],
      };
    }

    throw error;
  }
}

function loadExample(example: WorkflowExample): LoadedWorkflowExample {
  const text = buildWorkflowPayload(example.rawJson);
  return {
    text,
    ...parseWorkflowText(text),
  };
}

function countStates(document: WorkflowEditorDocument): number {
  return document.session.workflows.reduce(
    (total, workflow) => total + Object.keys(workflow.states).length,
    0,
  );
}

function countTransitions(document: WorkflowEditorDocument): number {
  return document.session.workflows.reduce(
    (total, workflow) =>
      total +
      Object.values(workflow.states).reduce(
        (stateTotal, state) => stateTotal + state.transitions.length,
        0,
      ),
    0,
  );
}

function summarizeIssues(issues: ValidationIssue[]) {
  return issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

export function WorkflowExamplesPage() {
  const firstExample = workflowExamples[0];
  if (!firstExample) {
    return (
      <section className="page-section">
        <div className="page-intro">
          <p className="eyebrow">Workflow playground</p>
          <h1>Cyoda Workflow Examples</h1>
          <p>No workflow fixtures are configured for this demo page.</p>
        </div>
      </section>
    );
  }

  const initialLoad = useMemo(() => loadExample(firstExample), [firstExample]);
  const [selectedExampleSlug, setSelectedExampleSlug] = useState(firstExample.slug);
  const [draftJson, setDraftJson] = useState(initialLoad.text);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<LoadedWorkflowExample>(initialLoad);
  const [draftIssues, setDraftIssues] = useState<ValidationIssue[]>(initialLoad.issues);
  const [applyError, setApplyError] = useState<string | null>(null);

  const selectedExample = workflowExamples.find((example) => example.slug === selectedExampleSlug);
  const renderedDocument = renderState.document;

  const graph = useMemo(() => {
    if (!renderedDocument) return null;
    return projectToGraph(renderedDocument);
  }, [renderedDocument]);

  if (!selectedExample) {
    return (
      <section className="page-section">
        <div className="page-intro">
          <p className="eyebrow">Workflow playground</p>
          <h1>Cyoda Workflow Examples</h1>
          <p>The selected workflow example could not be found.</p>
        </div>
      </section>
    );
  }

  if (!renderedDocument || !graph) {
    return (
      <section className="page-section">
        <div className="page-intro">
          <p className="eyebrow">Workflow playground</p>
          <h1>Cyoda Workflow Examples</h1>
          <p>The starter workflow could not be rendered.</p>
        </div>
        <div className="status-card status-card--error">
          <strong>Example load failed.</strong>
          {renderState.issues.map((issue, index) => (
            <p key={`${issue.code}-${index}`}>{issue.message}</p>
          ))}
        </div>
      </section>
    );
  }

  const renderIssueSummary = summarizeIssues(renderState.issues);
  const draftIssueSummary = summarizeIssues(draftIssues);
  const hasDraftChanges = draftJson !== renderState.text;

  const handleExampleChange = (slug: string) => {
    const nextExample = workflowExamples.find((example) => example.slug === slug);
    if (!nextExample) return;

    const nextLoad = loadExample(nextExample);
    setSelectedExampleSlug(slug);
    setDraftJson(nextLoad.text);
    setRenderState(nextLoad);
    setDraftIssues(nextLoad.issues);
    setApplyError(null);
    setSelectedGraphId(null);
  };

  const handleReset = () => {
    setDraftJson(renderState.text);
    setDraftIssues(renderState.issues);
    setApplyError(null);
  };

  const handleApply = () => {
    const nextParse = parseWorkflowText(draftJson);
    setDraftIssues(nextParse.issues);

    if (!nextParse.document) {
      setApplyError(
        "Could not render this JSON. Fix the issues below and try again. The viewer is still showing the last valid workflow.",
      );
      return;
    }

    setRenderState({
      text: draftJson,
      document: nextParse.document,
      issues: nextParse.issues,
    });
    setApplyError(null);
    setSelectedGraphId(null);
  };

  return (
    <section className="page-section">
      <div className="page-intro">
        <p className="eyebrow">Workflow playground</p>
        <h1>Cyoda Workflow Examples</h1>
        <p>
          Local test page for visually checking example workflow JSON against the current monorepo
          packages. Pick a fixture, inspect the rendered graph, tweak the JSON if you want, and
          re-apply.
        </p>
      </div>

      <div className="selector-card">
        <div>
          <strong>Workflow selector</strong>
          <p className="muted-text">
            Add more fixtures later by extending one array in the demo app.
          </p>
        </div>
        <div className="example-selector" role="tablist" aria-label="Workflow examples">
          {workflowExamples.map((example) => {
            const isActive = example.slug === selectedExampleSlug;
            return (
              <button
                key={example.slug}
                type="button"
                className={`example-button${isActive ? " example-button--active" : ""}`}
                onClick={() => handleExampleChange(example.slug)}
              >
                <span>{example.label}</span>
                <small>{example.description}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="stats-grid">
        <article className="status-card">
          <strong>Selected fixture</strong>
          <p>{selectedExample.label}</p>
        </article>
        <article className="status-card">
          <strong>Workflows</strong>
          <p>{renderedDocument.session.workflows.length}</p>
        </article>
        <article className="status-card">
          <strong>States</strong>
          <p>{countStates(renderedDocument)}</p>
        </article>
        <article className="status-card">
          <strong>Transitions</strong>
          <p>{countTransitions(renderedDocument)}</p>
        </article>
        <article className="status-card">
          <strong>Applied issues</strong>
          <p>
            {renderIssueSummary.error} errors, {renderIssueSummary.warning} warnings,{" "}
            {renderIssueSummary.info} infos
          </p>
        </article>
      </div>

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
            {selectedGraphId && (
              <p className="selection-note">
                Selected graph id: <code>{selectedGraphId}</code>
              </p>
            )}
          </div>
          <div className="viewer-card viewer-card--playground">
            <WorkflowViewer graph={graph} onSelectionChange={setSelectedGraphId} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading panel-heading--stacked">
            <div>
              <h2>Raw JSON</h2>
              <p className="muted-text">
                Edit the import payload directly, then apply when you want to re-render.
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
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={handleApply}
              >
                Apply JSON
              </button>
            </div>
          </div>

          <label className="json-label" htmlFor="workflow-json">
            Example JSON
          </label>
          <textarea
            id="workflow-json"
            className="json-editor"
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            spellCheck={false}
          />

          {applyError ? (
            <div className="status-card status-card--error">
              <strong>JSON apply failed</strong>
              <p>{applyError}</p>
            </div>
          ) : (
            <div className="status-card">
              <strong>Draft status</strong>
              <p>
                {hasDraftChanges
                  ? "Draft has unapplied changes."
                  : "Draft matches the rendered workflow."}
              </p>
            </div>
          )}

          <div className="issues-panel">
            <div className="issues-summary">
              <strong>Latest parse</strong>
              <span>
                {draftIssueSummary.error} errors, {draftIssueSummary.warning} warnings,{" "}
                {draftIssueSummary.info} infos
              </span>
            </div>
            {draftIssues.length === 0 ? (
              <p className="muted-text">No validation issues reported for the current draft.</p>
            ) : (
              <ul className="issues-list">
                {draftIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    <strong>{issue.severity.toUpperCase()}</strong> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
