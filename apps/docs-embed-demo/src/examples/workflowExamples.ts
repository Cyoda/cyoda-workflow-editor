import sampleWorkflowRaw from "./workflows/sample-workflow.json?raw";
import tradeSettlementWorkflowRaw from "./workflows/trade-settlement-workflow.json?raw";

export interface WorkflowExample {
  slug: string;
  label: string;
  description: string;
  rawJson: string;
}

export const workflowExamples: WorkflowExample[] = [
  {
    slug: "document-lifecycle",
    label: "Document lifecycle sample",
    description: "Small four-state workflow with processors and a lifecycle criterion.",
    rawJson: sampleWorkflowRaw,
  },
  {
    slug: "trade-settlement",
    label: "Trade settlement workflow",
    description: "Larger post-trade workflow with repair paths and multiple status gates.",
    rawJson: tradeSettlementWorkflowRaw,
  },
];
