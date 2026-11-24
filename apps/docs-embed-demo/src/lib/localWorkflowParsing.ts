import {
  ParseJsonError,
  parseImportPayload,
  prettyStringify,
  type ValidationIssue,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { extractLoadNotices } from "./workflowDemo.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStateMap(states: unknown): unknown {
  if (!isRecord(states)) return states;

  return Object.fromEntries(
    Object.entries(states).map(([stateCode, state]) => {
      if (!isRecord(state)) return [stateCode, state];
      if ("transitions" in state) return [stateCode, state];
      return [stateCode, { ...state, transitions: [] }];
    }),
  );
}

function normalizeWorkflowPayloadValue(value: unknown): unknown {
  if (!isRecord(value)) return value;

  // Same rule as cyoda-dev-console's `synthesizeImportPayload`: anything
  // with `workflows` but no `importMode` — a cyoda-go export
  // (`entityName`/`modelVersion`/`workflows`) or a bare `{ workflows }` — gets
  // `importMode: "MERGE"`; a standalone workflow object is wrapped.
  const payload = Array.isArray(value.workflows)
    ? "importMode" in value
      ? value
      : { importMode: "MERGE", ...value }
    : {
        importMode: "MERGE",
        workflows: [value],
      };

  if (!Array.isArray(payload.workflows)) return payload;

  return {
    ...payload,
    workflows: payload.workflows.map((workflow) => {
      if (!isRecord(workflow)) return workflow;
      if (!("states" in workflow)) return workflow;
      return {
        ...workflow,
        states: normalizeStateMap(workflow.states),
      };
    }),
  };
}

export function prepareLocalWorkflowPayload(text: string): string {
  try {
    return prettyStringify(normalizeWorkflowPayloadValue(JSON.parse(text)));
  } catch {
    return text;
  }
}

export function parseLocalWorkflowFile(text: string): {
  document: WorkflowEditorDocument;
  issues: ValidationIssue[];
  notices: string[];
} {
  try {
    const parsed = parseImportPayload(prepareLocalWorkflowPayload(text));
    if (!parsed.document) {
      const reasons = (parsed.issues ?? [])
        .filter((issue) => issue.severity === "error")
        .map((issue) => {
          // Schema issues carry the failing location in `detail.path`.
          const path = issue.detail?.["path"];
          return Array.isArray(path) && path.length > 0
            ? `${path.join(".")}: ${issue.message}`
            : issue.message;
        });
      throw new Error(
        reasons.length > 0
          ? reasons.join("; ")
          : "Workflow JSON parsed without producing a document.",
      );
    }
    const issues = parsed.issues ?? [];
    return {
      document: parsed.document,
      issues,
      notices: extractLoadNotices(issues),
    };
  } catch (error) {
    if (error instanceof ParseJsonError) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
}
