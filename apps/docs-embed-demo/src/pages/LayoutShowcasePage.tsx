import { useEffect, useMemo, useState } from "react";
import { layoutGraph, type LayoutPreset } from "@cyoda/workflow-layout";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer, simpleLayout } from "@cyoda/workflow-viewer";
import { DocumentStats, FixtureSelector, PageIntro } from "../components/DemoUi.js";
import { fixtureBySlug, fixturesFor } from "../examples/fixtureCatalog.js";
import { loadFixture } from "../lib/workflowDemo.js";

type Orientation = "vertical" | "horizontal";

export function LayoutShowcasePage() {
  const fixtures = fixturesFor("layout");
  const [selectedSlug, setSelectedSlug] = useState(fixtures[0]?.slug ?? "");
  const [preset, setPreset] = useState<LayoutPreset>("configuratorReadable");
  const [orientation, setOrientation] = useState<Orientation>("vertical");
  const [pinStartState, setPinStartState] = useState(false);

  const selectedFixture = fixtureBySlug(selectedSlug) ?? fixtures[0];
  const loaded = useMemo(() => (selectedFixture ? loadFixture(selectedFixture) : null), [selectedFixture]);
  const document = loaded?.document ?? null;
  const graph = useMemo(() => (document ? projectToGraph(document) : null), [document]);
  const [elkLayout, setElkLayout] = useState<Awaited<ReturnType<typeof layoutGraph>> | null>(null);

  useEffect(() => {
    let active = true;
    if (!graph || !document) {
      setElkLayout(null);
      return;
    }

    const firstStateId = Object.keys(document.meta.ids.states)[0] ?? null;
    const pinned =
      pinStartState && firstStateId
        ? [
            {
              id: firstStateId,
              x: orientation === "vertical" ? 48 : 60,
              y: orientation === "vertical" ? 40 : 36,
            },
          ]
        : [];

    layoutGraph(graph, { preset, orientation, pinned })
      .then((result) => {
        if (active) setElkLayout(result);
      })
      .catch(() => {
        if (active) setElkLayout(null);
      });

    return () => {
      active = false;
    };
  }, [document, graph, orientation, pinStartState, preset]);

  if (!selectedFixture || !loaded || !document || !graph) {
    return (
      <section className="page-section">
        <PageIntro
          eyebrow="Layout showcase"
          title="Workflow layout comparison"
          description="No layout fixture could be loaded."
        />
      </section>
    );
  }

  const fallback = simpleLayout(graph);

  return (
    <section className="page-section" data-testid="layout-page">
      <PageIntro
        eyebrow="Layout showcase"
        title="Fallback layout versus ELK layout"
        description="This page keeps the viewer constant and swaps only the layout strategy so routing, presets, orientation changes, and pinned nodes are visually testable."
      />

      <FixtureSelector fixtures={fixtures} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
      <DocumentStats
        fixture={selectedFixture}
        document={document}
        issues={loaded.issues}
        extra={[
          { label: "Preset", value: preset },
          { label: "Orientation", value: orientation },
          { label: "Pinned nodes", value: pinStartState ? 1 : 0 },
        ]}
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Layout controls</h2>
            <p className="muted-text">Exercise `layoutGraph`, its presets, orientation, and fixed pinning.</p>
          </div>
          <div className="panel-actions">
            <select value={preset} onChange={(event) => setPreset(event.target.value as LayoutPreset)} className="control-select">
              <option value="configuratorReadable">configuratorReadable</option>
              <option value="websiteCompact">websiteCompact</option>
              <option value="opsAudit">opsAudit</option>
            </select>
            <select
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as Orientation)}
              className="control-select"
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
            <label className="check-label">
              <input
                type="checkbox"
                checked={pinStartState}
                onChange={(event) => setPinStartState(event.target.checked)}
              />
              <span>Pin first state</span>
            </label>
          </div>
        </div>
      </section>

      <div className="dual-view-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Viewer fallback</h2>
              <p className="muted-text">`WorkflowViewer` with its built-in `simpleLayout` fallback.</p>
            </div>
            <p className="selection-note">
              Canvas size: <code>{fallback.width} x {fallback.height}</code>
            </p>
          </div>
          <div className="viewer-card viewer-card--medium">
            <WorkflowViewer graph={graph} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>ELK-powered layout</h2>
              <p className="muted-text">`layoutGraph` result fed back into the same viewer component.</p>
            </div>
            {elkLayout && (
              <p className="selection-note">
                Canvas size: <code>{elkLayout.width} x {elkLayout.height}</code>
              </p>
            )}
          </div>
          <div className="viewer-card viewer-card--medium" data-testid="elk-layout-view">
            {elkLayout ? <WorkflowViewer graph={graph} layout={elkLayout} /> : <div className="loader-copy">Computing ELK layout...</div>}
          </div>
        </section>
      </div>
    </section>
  );
}
