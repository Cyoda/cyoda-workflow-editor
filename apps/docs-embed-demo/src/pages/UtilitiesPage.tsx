import { useMemo, useState } from "react";
import {
  applyPatch,
  idFor,
  invertPatch,
  listMigrations,
  lookupById,
  migrateSession,
  registerMigration,
} from "@cyoda/workflow-core";
import { applyGraphEdit, projectToGraph } from "@cyoda/workflow-graph";
import { diffSummary } from "@cyoda/workflow-react";
import { DocumentStats, FixtureSelector, JsonBlock, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { loadFixture } from "../lib/workflowDemo.js";

registerMigration({
  from: "1.0",
  to: "1.1-demo",
  migrate: (session) => ({
    ...session,
    workflows: session.workflows.map((workflow) => ({
      ...workflow,
      desc: workflow.desc ? `${workflow.desc} [demo migrated]` : "demo migrated",
    })),
  }),
});

export function UtilitiesPage() {
  const fixtures = fixturesFor("utilities");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0];
  const loaded = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const document = loaded?.document ?? null;

  if (!selectedFixture || !loaded || !document) {
    return (
      <section className="page-section">
        <PageIntro
          eyebrow="Developer utilities"
          title="Lower-level API harnesses"
          description="No utility fixture could be loaded."
        />
      </section>
    );
  }

  const workflowName = document.session.workflows[0]?.name ?? "workflow1";
  const transitionUuid = Object.keys(document.meta.ids.transitions)[0] ?? null;
  const stateUuid = Object.keys(document.meta.ids.states)[0] ?? null;
  const graph = projectToGraph(document);
  const togglePatch = transitionUuid
    ? { op: "updateTransition", transitionUuid, updates: { disabled: true } } as const
    : null;
  const afterToggle = togglePatch ? applyPatch(document, togglePatch) : document;
  const inverse = togglePatch ? invertPatch(document, togglePatch) : null;
  const diff = diffSummary(document, afterToggle);
  const graphEdits = transitionUuid
    ? applyGraphEdit(document, {
        kind: "toggleDisabled",
        transitionUuid,
        disabled: true,
      })
    : [];
  const migrated = migrateSession(document.session, "1.0", "1.1-demo");
  const stateLookup = stateUuid ? lookupById(document, stateUuid) : null;
  const workflowId = idFor(document.meta, { kind: "workflow", workflow: workflowName });

  return (
    <section className="page-section" data-testid="utilities-page">
      <PageIntro
        eyebrow="Developer utilities"
        title="Programmatic API smoke harness"
        description="These panels keep the lower-level public helpers visible and testable without pretending they need a full end-user UX."
      />

      <FixtureSelector fixtures={fixtures} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
      <DocumentStats
        fixture={selectedFixture}
        document={document}
        issues={loaded.issues}
        extra={[
          { label: "Graph nodes", value: graph.nodes.length },
          { label: "Graph edges", value: graph.edges.length },
        ]}
      />

      <div className="route-grid route-grid--wide">
        <JsonBlock title="applyPatch + invertPatch" text={JSON.stringify({ patch: togglePatch, inverse }, null, 2)} />
        <JsonBlock title="applyGraphEdit output" text={JSON.stringify(graphEdits, null, 2)} />
        <JsonBlock title="diffSummary output" text={diff ?? "null"} />
        <JsonBlock title="lookupById / idFor" text={JSON.stringify({ workflowId, stateLookup }, null, 2)} />
        <JsonBlock title="Registered migrations" text={JSON.stringify(listMigrations(), null, 2)} />
        <JsonBlock title="migrateSession result" text={JSON.stringify(migrated, null, 2)} />
      </div>
    </section>
  );
}
