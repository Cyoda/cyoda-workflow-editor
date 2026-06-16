import type { FieldHint } from "@cyoda/workflow-core";

/**
 * Split a supported-subset JSONPath into its readable segments, dropping the
 * `$` root. Object keys become `name`; array indices stay attached to the
 * preceding key as `name[0]` / `name[*]`. The supported subset is narrow
 * (see `validateJsonPathSubset`), so a light tokenizer is sufficient.
 */
function segments(jsonPath: string): string[] {
  const path = jsonPath.trim();
  if (path === "" || path === "$") return [];
  const out: string[] = [];
  // Strip leading `$`; tolerate a missing root for robustness.
  let rest = path.startsWith("$") ? path.slice(1) : path;
  // Walk `.name` and `[index]` tokens, attaching indices to the current segment.
  let i = 0;
  let current = "";
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === ".") {
      if (current !== "") out.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === "[") {
      const end = rest.indexOf("]", i);
      if (end === -1) {
        current += rest.slice(i);
        i = rest.length;
        continue;
      }
      current += rest.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current !== "") out.push(current);
  return out;
}

/**
 * Last segment of a JSONPath, array-aware:
 * `$.a.b[0].currency` → `currency`, `$.list[*]` → `list[*]`.
 * Falls back to the raw path when there is nothing to derive.
 */
export function deriveLeafName(jsonPath: string): string {
  const segs = segments(jsonPath);
  return segs.at(-1) ?? jsonPath.trim();
}

/**
 * Human-readable path with the `$` root stripped:
 * `$.settlement.instructions[0].currency` →
 * `settlement.instructions[0].currency`.
 */
export function readablePath(jsonPath: string): string {
  const segs = segments(jsonPath);
  return segs.length > 0 ? segs.join(".") : jsonPath.trim();
}

export interface FieldLabel {
  /** Readable primary label (leaf name, or readable path when ambiguous). */
  primary: string;
  /** The raw JSONPath, always the committed value. */
  secondary: string;
}

/**
 * Build display labels for a hint list. `secondary` is always the raw
 * `jsonPath`. `primary` is the leaf name, except when a leaf name is shared by
 * more than one hint — those collisions fall back to the longer readable path
 * so the user can tell them apart.
 */
export function buildFieldLabels(hints: FieldHint[]): Map<string, FieldLabel> {
  const leafCounts = new Map<string, number>();
  for (const hint of hints) {
    const leaf = deriveLeafName(hint.jsonPath);
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);
  }

  const labels = new Map<string, FieldLabel>();
  for (const hint of hints) {
    const leaf = deriveLeafName(hint.jsonPath);
    const ambiguous = (leafCounts.get(leaf) ?? 0) > 1;
    labels.set(hint.jsonPath, {
      primary: ambiguous ? readablePath(hint.jsonPath) : leaf,
      secondary: hint.jsonPath,
    });
  }
  return labels;
}
