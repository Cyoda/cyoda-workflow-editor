import {
  validateAll,
  type ValidationIssue,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import type { GraphDocument } from "@cyoda/workflow-graph";
import { projectToGraph } from "@cyoda/workflow-graph";

export interface DerivedState {
  graph: GraphDocument;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Re-run validation + projection from the canonical session. Memoised by the
 * caller — the editor shell typically memoises on `document.meta.revision`.
 */
export function deriveFromDocument(doc: WorkflowEditorDocument): DerivedState {
  const issues = validateAll(doc);
  const graph = projectToGraph(doc, { issues });
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount++;
    else if (issue.severity === "warning") warningCount++;
    else infoCount++;
  }
  return { graph, issues, errorCount, warningCount, infoCount };
}
