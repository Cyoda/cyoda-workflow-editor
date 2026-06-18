import type { Workflow } from "../types/workflow.js";
import type { CyodaSchemaVersion } from "./version.js";

/**
 * The result of rewriting a raw wire tree into the canonical raw shape.
 *
 * - `value` is the canonical raw value handed to the Zod schema.
 * - `warnings` are human-readable notes about lossy or dropped content (e.g. a
 *   v0.7 `scheduled` processor removed during normalisation). Empty when none.
 */
export interface ToCanonicalResult {
  value: unknown;
  warnings: string[];
}

/**
 * A cyoda-go schema dialect: the two version-specific edges around the editor's
 * single canonical in-memory model (`Workflow`/`Criterion`).
 *
 * - `toCanonical` rewrites a raw parsed JSON tree produced by this cyoda-go
 *   version into the canonical raw shape the Zod schema expects (runs before
 *   validation; may throw to signal an unrecoverable conflict). It returns the
 *   transformed value plus any warnings surfaced to the caller.
 * - `workflowsToWire` renders canonical workflows into the plain objects this
 *   cyoda-go version expects on the wire (consumed by the serializer).
 *
 * The 0.7 baseline composes the existing `normalizeOperatorAlias` /
 * `coerceCanonicalDefaults` / `outputWorkflow` helpers; the 0.8 dialect adds
 * `transitions[].schedule` and a strict output allowlist.
 */
export interface CyodaDialect {
  readonly version: CyodaSchemaVersion;
  toCanonical(raw: unknown): ToCanonicalResult;
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>>;
}
