/**
 * The Zod schemas describe the canonical in-memory model, where an array
 * criterion's positional list is `value`. The JSON the editor shows and writes
 * uses the wire key `values` — the only one cyoda-go reads. Rewrite every
 * array-criterion node of a generated JSON Schema to that wire key so Monaco
 * validates the text the user actually sees. Mutates and returns `schema`.
 */
export function withArrayCriterionWireKeys<T extends object>(schema: T): T {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const n = node as Record<string, unknown>;
    const props = n["properties"] as Record<string, unknown> | undefined;
    const type = props?.["type"] as { const?: unknown } | undefined;
    if (props && type?.const === "array" && "value" in props) {
      props["values"] = props["value"];
      delete props["value"];
      if (Array.isArray(n["required"])) {
        n["required"] = (n["required"] as string[]).map((k) => (k === "value" ? "values" : k));
      }
    }
    Object.values(n).forEach(visit);
  };
  visit(schema);
  return schema;
}
