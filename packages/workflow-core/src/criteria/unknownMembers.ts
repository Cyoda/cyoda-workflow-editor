/**
 * Members a criterion node may carry, per condition type, in the canonical raw
 * shape (after `normalizeOperatorAlias` has folded `operatorType` / `operator`
 * into `operation` and an array clause's `values` into `value`).
 *
 * cyoda-go 0.9.0 refuses an undeclared member anywhere in a criterion (strict
 * member names). Zod strips such a member silently, which can change what the
 * criterion means — e.g. `calculationNodesTags` written beside a function
 * condition's `config` instead of inside it leaves the callout untagged — so
 * the parser reports them instead of losing them quietly.
 */
const CONDITION_MEMBERS: Readonly<Record<string, ReadonlySet<string>>> = {
  simple: new Set(["type", "jsonPath", "operation", "value"]),
  lifecycle: new Set(["type", "field", "operation", "value"]),
  array: new Set(["type", "jsonPath", "operation", "value"]),
  group: new Set(["type", "operator", "conditions"]),
  function: new Set(["type", "function"]),
};
const FUNCTION_MEMBERS: ReadonlySet<string> = new Set(["name", "config", "criterion"]);
const FUNCTION_CONFIG_MEMBERS: ReadonlySet<string> = new Set([
  "attachEntity",
  "calculationNodesTags",
  "responseTimeoutMs",
  "retryPolicy",
  "context",
]);

export interface UnknownCriterionMembers {
  /** JSON Pointer from the criterion root to the object holding the members ("" = root). */
  pointer: string;
  /** The undeclared member names, in source order. */
  keys: string[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unknownKeys(node: Record<string, unknown>, allowed: ReadonlySet<string>): string[] {
  return Object.keys(node).filter((k) => !allowed.has(k));
}

/**
 * Every object in a raw (alias-normalized) criterion tree that carries members
 * outside its condition type's declared set. Nodes of an unknown `type` are
 * skipped — the schema reports those. Iterative, so a deep tree cannot
 * overflow the stack.
 */
export function findUnknownCriterionMembers(criterion: unknown): UnknownCriterionMembers[] {
  const found: UnknownCriterionMembers[] = [];
  const stack: { node: unknown; pointer: string }[] = [{ node: criterion, pointer: "" }];
  while (stack.length > 0) {
    const { node, pointer } = stack.pop()!;
    if (!isObj(node)) continue;
    const allowed = typeof node["type"] === "string" ? CONDITION_MEMBERS[node["type"]] : undefined;
    if (!allowed) continue;
    const keys = unknownKeys(node, allowed);
    if (keys.length > 0) found.push({ pointer, keys });

    if (node["type"] === "group" && Array.isArray(node["conditions"])) {
      const conditions = node["conditions"] as unknown[];
      for (let i = conditions.length - 1; i >= 0; i--) {
        stack.push({ node: conditions[i], pointer: `${pointer}/conditions/${i}` });
      }
    } else if (node["type"] === "function" && isObj(node["function"])) {
      const fn = node["function"];
      const fnPointer = `${pointer}/function`;
      const fnKeys = unknownKeys(fn, FUNCTION_MEMBERS);
      if (fnKeys.length > 0) found.push({ pointer: fnPointer, keys: fnKeys });
      if (isObj(fn["config"])) {
        const cfgKeys = unknownKeys(fn["config"], FUNCTION_CONFIG_MEMBERS);
        if (cfgKeys.length > 0) found.push({ pointer: `${fnPointer}/config`, keys: cfgKeys });
      }
      if (fn["criterion"] !== undefined) {
        stack.push({ node: fn["criterion"], pointer: `${fnPointer}/criterion` });
      }
    }
  }
  return found;
}
