import type { Workflow } from "../types/workflow.js";
import type { CyodaSchemaVersion } from "./version.js";

/**
 * The result of rewriting a raw wire tree into the canonical raw shape.
 *
 * - `value` is the canonical raw value handed to the Zod schema.
 * - `warnings` are human-readable notes about lossy or dropped content (e.g.
 *   `processor-config-keys-dropped:<name>:<keys>` when the 0.8 dialect strips
 *   a processor-config key cyoda-go doesn't recognise, or
 *   `processor-keys-dropped:<name>:<keys>` for the same at processor level).
 *   Empty when none.
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
 * The shipped 0.8 dialect composes the `normalizeOperatorAlias` /
 * `coerceCanonicalDefaults` / `outputWorkflow` helpers and adds
 * `transitions[].schedule` plus a strict output allowlist. (The 0.7 dialect
 * these helpers originated in was removed in the 0.8.3 release — see
 * `ai/cyoda-schema-versions.md`.)
 */
export interface CyodaDialect {
  /**
   * The cyoda-go dialect key — e.g. `"0.8"`. This is the REGISTRY key.
   *
   * NB: do not confuse with `schemaVersionTag` below. `version` identifies the
   * cyoda-go binary line; `schemaVersionTag` is the value written INSIDE a
   * workflow document. Both look like MAJOR.MINOR and mean entirely different
   * things. See `ai/cyoda-schema-versions.md`.
   */
  readonly version: CyodaSchemaVersion;

  /**
   * The in-document `version` tag this dialect stamps on NEW workflows — e.g.
   * `"1.4"` for the 0.8 dialect (cyoda-go 0.8.4). Required: a dialect that cannot say which tag
   * its wire contract uses is under-specified, and any default we invented for
   * an absent value would be the hardcoded literal this field exists to remove.
   */
  readonly schemaVersionTag: string;

  /**
   * Which in-document tags the target server accepts. Absent means the server
   * does not validate the tag, so the editor skips the check. An array because
   * the discovery endpoint returns one — multiple majors may be accepted
   * concurrently during a deprecation window.
   */
  readonly acceptedSchemaVersions?: readonly {
    major: number;
    minMinor: number;
    maxMinor: number;
  }[];

  toCanonical(raw: unknown): ToCanonicalResult;
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>>;
}
