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
 */
export function normalizeOperatorAlias(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeOperatorAlias(item));
  }
  if (!isObject(raw)) return raw;

  const result: UnknownRecord = {};
  for (const [k, v] of Object.entries(raw)) {
    // `annotations` is engine-opaque, client-owned metadata (workflow/state/
    // transition level, cyoda-go 0.8.1). Never recurse into it: aliasing
    // operatorType->operation inside a client's opaque object would corrupt it,
    // and a value carrying both keys would throw. Clone so the "returns a new
    // tree" invariant in this function's docstring still holds.
    result[k] = k === "annotations" ? structuredClone(v) : normalizeOperatorAlias(v);
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
  return result;
}
