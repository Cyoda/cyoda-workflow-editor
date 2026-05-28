import { parseImportPayload } from "../../src/index.js";
import type { WorkflowEditorDocument } from "../../src/index.js";

/** Build a minimal valid editor document from a plain workflow JSON payload. */
export function makeDoc(overrides?: {
  workflowName?: string;
  initialState?: string;
  extraStates?: string[];
}): WorkflowEditorDocument {
  const name = overrides?.workflowName ?? "wf";
  const initialState = overrides?.initialState ?? "start";
  const extraStates = overrides?.extraStates ?? [];
  const states: Record<string, unknown> = {
    [initialState]: { transitions: [] },
    end: { transitions: [] },
  };
  for (const s of extraStates) {
    states[s] = { transitions: [] };
  }
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name,
          initialState,
          active: true,
          states,
        },
      ],
    }),
  );
  if (!result.document) throw new Error("Failed to build test document");
  return result.document;
}

/** Return the transition UUID for the first transition of a state. */
export function firstTransitionUuid(
  doc: WorkflowEditorDocument,
  workflowName: string,
  stateCode: string,
): string {
  for (const [uuid, ptr] of Object.entries(doc.meta.ids.transitions)) {
    if (ptr.workflow === workflowName && ptr.state === stateCode) return uuid;
  }
  throw new Error(`No transition found for ${workflowName}:${stateCode}`);
}
