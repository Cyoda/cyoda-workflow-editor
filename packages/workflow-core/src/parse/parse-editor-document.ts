import { z } from "zod";
import { ImportPayloadSchema } from "../schema/payload.js";
import type { WorkflowEditorDocument } from "../types/editor.js";
import { assignSyntheticIds } from "../identity/assign.js";
import { normalizeWorkflowInput } from "../normalize/input.js";
import { normalizeOperatorAlias } from "./operator-alias.js";
import { validateSemantics } from "../validate/semantic.js";
import { zodErrorToIssues } from "../validate/schema.js";
import { ParseJsonError } from "./errors.js";
import type { ParseResult } from "./parse-import.js";

const EditorDocumentSchema = z.object({
  session: z.object({
    entity: z
      .object({
        entityName: z.string(),
        modelVersion: z.number().int().positive(),
      })
      .nullable(),
    importMode: z.enum(["MERGE", "REPLACE", "ACTIVATE"]),
    workflows: z.array(z.unknown()),
  }),
  meta: z
    .object({
      revision: z.number().int().nonnegative(),
      ids: z.unknown(),
      workflowUi: z.record(z.string(), z.unknown()),
      lastValidJsonHash: z.string().optional(),
    })
    .passthrough(),
});

export function parseEditorDocument(
  json: string,
): ParseResult<WorkflowEditorDocument> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new ParseJsonError(`Invalid JSON: ${(e as Error).message}`);
  }

  const outerResult = EditorDocumentSchema.safeParse(parsed);
  if (!outerResult.success) {
    return { ok: false, issues: zodErrorToIssues(outerResult.error) };
  }

  const aliased = normalizeOperatorAlias(outerResult.data.session);
  const inner = ImportPayloadSchema.omit({ importMode: true }).extend({
    importMode: z.enum(["MERGE", "REPLACE", "ACTIVATE"]),
  });
  const sessionResult = inner.safeParse({
    importMode: outerResult.data.session.importMode,
    workflows: (aliased as { workflows: unknown }).workflows,
  });
  if (!sessionResult.success) {
    return { ok: false, issues: zodErrorToIssues(sessionResult.error) };
  }

  const normalizedWorkflows = sessionResult.data.workflows.map(normalizeWorkflowInput);
  const session = {
    entity: outerResult.data.session.entity,
    importMode: sessionResult.data.importMode,
    workflows: normalizedWorkflows,
  };

  const meta = assignSyntheticIds(
    session,
    outerResult.data.meta as WorkflowEditorDocument["meta"],
  );
  const document: WorkflowEditorDocument = { session, meta };
  const issues = validateSemantics(session, document);
  const hasError = issues.some((i) => i.severity === "error");

  return { ok: !hasError, document, value: document, issues };
}
