import { useMemo, useState } from "react";
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "@cyoda/workflow-viewer";

const ALERT_TRIAGE = `{
  "importMode": "MERGE",
  "workflows": [
    {
      "version": "1.0",
      "name": "alertTriage",
      "initialState": "raised",
      "active": true,
      "states": {
        "raised": {
          "transitions": [
            { "name": "classify", "next": "triaged", "manual": false, "disabled": false }
          ]
        },
        "triaged": {
          "transitions": [
            { "name": "assign", "next": "investigating", "manual": true, "disabled": false },
            { "name": "autoResolve", "next": "resolved", "manual": false, "disabled": false }
          ]
        },
        "investigating": {
          "transitions": [
            { "name": "escalate", "next": "escalated", "manual": true, "disabled": false },
            { "name": "resolve", "next": "resolved", "manual": false, "disabled": false }
          ]
        },
        "escalated": {
          "transitions": [
            { "name": "resolve", "next": "resolved", "manual": false, "disabled": false }
          ]
        },
        "resolved": { "transitions": [] }
      }
    }
  ]
}`;

export function EmbedViewerPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const graph = useMemo(() => {
    const parsed = parseImportPayload(ALERT_TRIAGE);
    if (!parsed.document) return null;
    return projectToGraph(parsed.document);
  }, []);

  if (!graph) {
    return (
      <section className="page-section">
        <div className="page-intro">
          <p className="eyebrow">Embed demo</p>
          <h1>Alert triage workflow</h1>
          <p>Failed to parse the embedded example workflow.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="page-intro">
        <p className="eyebrow">Embed demo</p>
        <h1>Alert triage workflow</h1>
        <p>
          Minimal read-only viewer example using the current monorepo packages. This preserves the
          original docs embed demonstration alongside the new playground page.
        </p>
      </div>

      <div className="viewer-card viewer-card--embed">
        <WorkflowViewer
          graph={graph}
          selectedId={selected ?? undefined}
          onSelectionChange={setSelected}
        />
      </div>

      {selected && (
        <p className="selection-note">
          Selected id: <code>{selected}</code>
        </p>
      )}
    </section>
  );
}
