import type { ValidationIssue, WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { DemoFixture } from "../examples/fixtureCatalog.js";

export function countStates(document: WorkflowEditorDocument): number {
  return document.session.workflows.reduce(
    (total, workflow) => total + Object.keys(workflow.states).length,
    0,
  );
}

export function countTransitions(document: WorkflowEditorDocument): number {
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

export function summarizeIssues(issues: ValidationIssue[]) {
  return issues.reduce(
    (summary, issue) => {
      summary[issue.severity] += 1;
      return summary;
    },
    { error: 0, warning: 0, info: 0 },
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function FixtureSelector({
  fixtures,
  selectedSlug,
  onSelect,
}: {
  fixtures: DemoFixture[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="selector-card">
      <div>
        <strong>Fixture selector</strong>
        <p className="muted-text">
          Each fixture is tagged so the same catalog can drive viewer, editor, save-flow, and
          developer harness scenarios.
        </p>
      </div>
      <div className="example-selector" role="tablist" aria-label="Workflow fixtures">
        {fixtures.map((fixture) => {
          const isActive = fixture.slug === selectedSlug;
          return (
            <button
              key={fixture.slug}
              type="button"
              className={`example-button${isActive ? " example-button--active" : ""}`}
              onClick={() => onSelect(fixture.slug)}
            >
              <span>{fixture.label}</span>
              <small>{fixture.description}</small>
              <small className="fixture-tags">{fixture.tags.join(" · ")}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DocumentStats({
  fixture,
  document,
  issues,
  extra,
}: {
  fixture: DemoFixture;
  document: WorkflowEditorDocument;
  issues: ValidationIssue[];
  extra?: Array<{ label: string; value: string | number }>;
}) {
  const summary = summarizeIssues(issues);
  const cards = [
    { label: "Fixture", value: fixture.label },
    { label: "Workflows", value: document.session.workflows.length },
    { label: "States", value: countStates(document) },
    { label: "Transitions", value: countTransitions(document) },
    {
      label: "Issues",
      value: `${summary.error} errors, ${summary.warning} warnings, ${summary.info} infos`,
    },
    ...(extra ?? []),
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <article className="status-card" key={card.label}>
          <strong>{card.label}</strong>
          <p>{card.value}</p>
        </article>
      ))}
    </div>
  );
}

export function IssuesPanel({ issues }: { issues: ValidationIssue[] }) {
  const summary = summarizeIssues(issues);

  return (
    <div className="issues-panel">
      <div className="issues-summary">
        <strong>Latest parse</strong>
        <span>
          {summary.error} errors, {summary.warning} warnings, {summary.info} infos
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="muted-text">No validation issues reported for the current draft.</p>
      ) : (
        <ul className="issues-list">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <strong>{issue.severity.toUpperCase()}</strong> {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JsonBlock({
  title,
  text,
  className,
}: {
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p className="muted-text">Rendered verbatim for debugging and test assertions.</p>
        </div>
      </div>
      <pre className="code-block">{text}</pre>
    </section>
  );
}
