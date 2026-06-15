import type { Workflow } from "../types/workflow.js";
import type { CyodaSchemaVersion } from "./version.js";

/**
 * A cyoda-go schema dialect: the two version-specific edges around the editor's
 * single canonical in-memory model (`Workflow`/`Criterion`).
 *
 * - `toCanonical` rewrites a raw parsed JSON tree produced by this cyoda-go
 *   version into the canonical raw shape the Zod schema expects (runs before
 *   validation; may throw to signal an unrecoverable conflict).
 * - `workflowsToWire` renders canonical workflows into the plain objects this
 *   cyoda-go version expects on the wire (consumed by the serializer).
 *
 * The 0.7 baseline composes the existing `normalizeOperatorAlias` /
 * `coerceCanonicalDefaults` / `outputWorkflow` helpers, so it is behaviour-
 * neutral. A future version supplies only its deltas.
 */
export interface CyodaDialect {
  readonly version: CyodaSchemaVersion;
  toCanonical(raw: unknown): unknown;
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>>;
}
