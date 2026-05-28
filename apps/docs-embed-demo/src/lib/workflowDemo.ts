import type { ValidationIssue, WorkflowEditorDocument } from "@cyoda/workflow-core";
import { ParseJsonError, parseImportPayload, prettyStringify, serializeImportPayload } from "@cyoda/workflow-core";
import type { DemoFixture } from "../examples/fixtureCatalog.js";

export interface ParsedWorkflowState {
  document: WorkflowEditorDocument | null;
  issues: ValidationIssue[];
}

export interface LoadedFixture extends ParsedWorkflowState {
  fixture: DemoFixture;
  text: string;
}

export function buildWorkflowPayload(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object" && "workflows" in parsed) {
      return prettyStringify(parsed);
    }
    return prettyStringify({
      importMode: "MERGE",
      workflows: [parsed],
    });
  } catch {
    return rawJson;
  }
}

export function parseWorkflowText(text: string, prior?: WorkflowEditorDocument["meta"]): ParsedWorkflowState {
  try {
    const parsed = parseImportPayload(text, prior);
    return {
      document: parsed.document ?? null,
      issues: parsed.issues ?? [],
    };
  } catch (error) {
    if (error instanceof ParseJsonError) {
      return {
        document: null,
        issues: [
          {
            severity: "error",
            code: "invalid-json",
            message: error.message,
          },
        ],
      };
    }
    throw error;
  }
}

export function loadFixture(fixture: DemoFixture, prior?: WorkflowEditorDocument["meta"]): LoadedFixture {
  const text = buildWorkflowPayload(fixture.rawJson);
  return {
    fixture,
    text,
    ...parseWorkflowText(text, prior),
  };
}

export function requireDocument(load: LoadedFixture): WorkflowEditorDocument {
  if (!load.document) {
    throw new Error(`Fixture "${load.fixture.slug}" does not parse into a document.`);
  }
  return load.document;
}

export function documentSummary(document: WorkflowEditorDocument) {
  return {
    workflows: document.session.workflows.length,
    states: document.session.workflows.reduce(
      (total, workflow) => total + Object.keys(workflow.states).length,
      0,
    ),
    transitions: document.session.workflows.reduce(
      (total, workflow) =>
        total +
        Object.values(workflow.states).reduce(
          (stateTotal, state) => stateTotal + state.transitions.length,
          0,
        ),
      0,
    ),
  };
}

export function serializeDocument(document: WorkflowEditorDocument): string {
  return serializeImportPayload(document);
}
