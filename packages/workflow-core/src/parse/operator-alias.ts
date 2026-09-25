import { SchemaError } from "./errors.js";

type UnknownRecord = Record<string, unknown>;

const isObject = (v: unknown): v is UnknownRecord =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Rewrite `operatorType` → `operation` in-place on a deep-cloned JSON tree.
 * If both are present and agree, drop `operatorType`.
 * If both are present and disagree, throw SchemaError.
 *
 * Only applies to criterion-shaped nodes (type: simple | lifecycle | array).
 *
 * Array clauses additionally get `values` → `value`: cyoda-go reads the
 * positional list from `values` only (the OpenAPI's `value` is wrong), while
 * the canonical model and files written by earlier editor versions use
 * `value`. Same agree/disagree rule as the operator alias.
 *
 * `annotations` / `criterionAnnotations` values (workflow/state/transition/
 * processor level) are engine-opaque client metadata: they are copied through
 * verbatim and never recursed into, so a key literally named `operatorType`
 * inside a client annotation is left alone.
 */
export function normalizeOperatorAlias(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeOperatorAlias(item));
  }
  if (!isObject(raw)) return raw;

  const result: UnknownRecord = {};
  for (const [k, v] of Object.entries(raw)) {
    // `annotations` / `criterionAnnotations` are engine-opaque, client-owned
    // metadata (workflow/state/transition/processor level, cyoda-go 0.8.1+).
    // Never recurse into them: aliasing operatorType->operation inside a
    // client's opaque object would corrupt it, and a value carrying both keys
    // would throw. Clone so the "returns a new tree" invariant in this
    // function's docstring still holds.
    result[k] =
      k === "annotations" || k === "criterionAnnotations"
        ? structuredClone(v)
        : normalizeOperatorAlias(v);
  }

  const type = result["type"];
  const needsAlias =
    type === "simple" || type === "lifecycle" || type === "array" || type === undefined;

  if (needsAlias && "operatorType" in result) {
    const alias = result["operatorType"];
    const existing = result["operation"];
    if (existing !== undefined && existing !== alias) {
      throw new SchemaError(
        `Conflicting "operation" and "operatorType" values: ${JSON.stringify(existing)} vs ${JSON.stringify(alias)}`,
      );
    }
    result["operation"] = existing ?? alias;
    delete result["operatorType"];
  }

  if (type === "array" && "values" in result) {
    const wire = result["values"];
    const legacy = result["value"];
    if (legacy !== undefined && JSON.stringify(legacy) !== JSON.stringify(wire)) {
      throw new SchemaError(
        `Conflicting array criterion "value" and "values": ${JSON.stringify(legacy)} vs ${JSON.stringify(wire)}`,
      );
    }
    result["value"] = wire;
    delete result["values"];
  }
  return result;
}
