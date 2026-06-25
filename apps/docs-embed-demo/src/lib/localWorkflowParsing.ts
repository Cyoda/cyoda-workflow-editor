import {
  ParseJsonError,
  parseImportPayload,
  prettyStringify,
  type ValidationIssue,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";

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

  const payload = Array.isArray(value.workflows)
    ? value
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
} {
  try {
    const parsed = parseImportPayload(prepareLocalWorkflowPayload(text));
    if (!parsed.document) {
      throw new Error("Workflow JSON parsed without producing a document.");
    }
    return {
      document: parsed.document,
      issues: parsed.issues ?? [],
    };
  } catch (error) {
    if (error instanceof ParseJsonError) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
}
