import { useMemo, useState } from "react";
import { parseImportPayload, serializeImportPayload } from "@cyoda/workflow-core";
import { WorkflowViewer, type WorkflowInspection } from "@cyoda/workflow-viewer";
import tradeSettlementWorkflowRaw from "../examples/workflows/trade-settlement-workflow.json?raw";

export function OpsViewerPage() {
  const [inspection, setInspection] = useState<WorkflowInspection | null>(null);
  const parsed = useMemo(() => parseImportPayload(tradeSettlementWorkflowRaw), []);
  const document = parsed.document ?? null;

  const exportJson = () => {
    if (!document) return;
    const blob = new Blob([serializeImportPayload(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "ops-workflow-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="ops-viewer" data-testid="ops-viewer-page">
      <div className="ops-viewer__chrome">
        <div>
          <p className="eyebrow">Ops Console viewer</p>
          <h1>Environment: local-dev</h1>
        </div>
        <div className="ops-viewer__actions">
          <button type="button" className="action-button" onClick={exportJson} disabled={!document}>
            Export JSON
          </button>
          <button type="button" className="action-button" disabled>
            Compare with source
          </button>
          <button type="button" className="action-button" disabled title="Break-glass edit is host controlled">
            Break-glass edit
          </button>
        </div>
      </div>

      <p className="ops-viewer__warning">
        Directly editing workflow configuration on a running system is not best practice.
        Prefer source-controlled changes and normal deployment.
      </p>

      {document ? (
        <div className="ops-viewer__canvas">
          <WorkflowViewer
            document={document}
            surface="ops-console"
            layout="fullWidth"
            interaction="hover-path"
            onInspect={setInspection}
          />
        </div>
      ) : (
        <div className="loader-copy">Unable to parse ops viewer fixture.</div>
      )}

      {inspection && (
        <aside className="ops-viewer__inspect" data-testid="ops-viewer-inspection">
          <strong>{inspection.kind === "state" ? inspection.stateCode : inspection.transitionName}</strong>
          <span>{inspection.workflow}</span>
        </aside>
      )}
    </section>
  );
}
