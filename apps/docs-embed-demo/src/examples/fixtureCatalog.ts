import kitchenSinkWorkflowRaw from "./workflows/kitchen-sink-workflows.json?raw";
import sampleWorkflowRaw from "./workflows/sample-workflow.json?raw";
import saveHarnessWorkflowRaw from "./workflows/save-harness-workflow.json?raw";
import tradeSettlementWorkflowRaw from "./workflows/trade-settlement-workflow.json?raw";
import tradeCriteriaDemoWorkflowRaw from "./workflows/trade-criteria-demo-workflow.json?raw";

export type DemoCategory =
  | "viewer"
  | "layout"
  | "editor"
  | "monaco"
  | "save"
  | "utilities"
  | "criteria";

export interface DemoFixture {
  slug: string;
  label: string;
  description: string;
  rawJson: string;
  categories: DemoCategory[];
  tags: string[];
}

const intentionallyInvalidRaw = `{
  "importMode": "MERGE",
  "workflows": [
    {
      "version": "1.0",
      "name": "BrokenWorkflow",
      "initialState": "start",
      "active": true,
      "states": {
        "start": {
          "transitions": [
            {
              "name": "bad_transition",
              "next": "missing-target",
              "manual": false,
              "disabled": false
            }
          ]
        }
      }
    }
  ]
`;

export const demoFixtures: DemoFixture[] = [
  {
    slug: "document-lifecycle",
    label: "Document lifecycle sample",
    description: "Small four-state workflow with processors and a lifecycle criterion.",
    rawJson: sampleWorkflowRaw,
    categories: ["viewer", "layout", "editor", "monaco", "utilities"],
    tags: ["small", "lifecycle", "processors"],
  },
  {
    slug: "trade-settlement",
    label: "Trade settlement workflow",
    description: "Larger post-trade workflow with repair paths and multiple status gates.",
    rawJson: tradeSettlementWorkflowRaw,
    categories: ["viewer", "layout", "editor", "monaco", "utilities"],
    tags: ["medium", "repair-loop", "post-trade"],
  },
  {
    slug: "trade-criteria-demo",
    label: "Trade criteria demo",
    description: "Trade settlement variant that exercises every criterion shape: simple operators, group AND/OR/NOT, function with quick-exit, lifecycle, and array.",
    rawJson: tradeCriteriaDemoWorkflowRaw,
    categories: ["criteria"],
    tags: ["criteria", "simple", "group", "function", "lifecycle", "array", "post-trade"],
  },
  {
    slug: "kitchen-sink",
    label: "Kitchen sink workflows",
    description: "Multi-workflow payload with anchors, loopbacks, groups, warnings, and terminals.",
    rawJson: kitchenSinkWorkflowRaw,
    categories: ["viewer", "layout", "editor", "monaco", "utilities"],
    tags: ["multi-workflow", "anchors", "group-criteria", "warnings"],
  },
  {
    slug: "save-harness",
    label: "Save harness workflow",
    description: "Warning-heavy payload for save confirmation, diffing, and conflict tests.",
    rawJson: saveHarnessWorkflowRaw,
    categories: ["viewer", "editor", "monaco", "save", "utilities"],
    tags: ["save-flow", "warnings", "conflicts"],
  },
  {
    slug: "invalid-json",
    label: "Intentionally invalid JSON",
    description: "Broken import payload used to prove invalid JSON handling and markers.",
    rawJson: intentionallyInvalidRaw,
    categories: ["monaco", "viewer"],
    tags: ["invalid", "markers", "errors"],
  },
];

export function fixturesFor(category: DemoCategory): DemoFixture[] {
  return demoFixtures.filter((fixture) => fixture.categories.includes(category));
}

export function fixtureBySlug(slug: string): DemoFixture | undefined {
  return demoFixtures.find((fixture) => fixture.slug === slug);
}
