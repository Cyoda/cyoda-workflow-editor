import type {
  EntityFieldHintProvider,
  EntityIdentity,
  FieldHint,
} from "@cyoda/workflow-core";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function typeOf(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function describeArray(value: JsonValue[]): string {
  if (value.length === 0) return "array (empty)";
  const sample = value[0]!;
  return `array of ${typeOf(sample)}`;
}

function walk(
  value: JsonValue,
  path: string,
  hints: FieldHint[],
  depth: number,
  maxDepth: number,
): void {
  const valueType = typeOf(value);
  hints.push({
    jsonPath: path,
    type: valueType === "array" ? describeArray(value as JsonValue[]) : valueType,
  });

  if (depth >= maxDepth) return;

  if (valueType === "array") {
    const arr = value as JsonValue[];
    if (arr.length === 0) return;
    const first = arr[0]!;
    walk(first, `${path}[0]`, hints, depth + 1, maxDepth);
    walk(first, `${path}[*]`, hints, depth + 1, maxDepth);
    return;
  }

  if (valueType === "object") {
    const obj = value as { [k: string]: JsonValue };
    for (const key of Object.keys(obj)) {
      const childPath = `${path}.${key}`;
      walk(obj[key]!, childPath, hints, depth + 1, maxDepth);
    }
  }
}

/**
 * Build a flat list of FieldHints from a sample entity instance. Object keys
 * become `.field` segments; arrays expand into both `[0]` (first element) and
 * `[*]` (splat) variants so the autocomplete demo can showcase both forms.
 */
export function fieldHintsFromSample(sample: unknown, maxDepth = 6): FieldHint[] {
  const hints: FieldHint[] = [];
  walk(sample as JsonValue, "$", hints, 0, maxDepth);
  const seen = new Set<string>();
  const unique: FieldHint[] = [];
  for (const hint of hints) {
    if (seen.has(hint.jsonPath)) continue;
    seen.add(hint.jsonPath);
    unique.push(hint);
  }
  unique.sort((a, b) => a.jsonPath.localeCompare(b.jsonPath));
  return unique;
}

/**
 * Create a sample-backed EntityFieldHintProvider keyed by entityName. Useful for
 * demos where a real model-schema endpoint is not available — the editor's
 * cache de-duplicates calls so the async wrapper is cheap.
 */
export function createSampleHintProvider(
  samplesByEntity: Record<string, { sample: unknown; maxDepth?: number }>,
  fallbackLatencyMs = 0,
): EntityFieldHintProvider {
  return {
    async listFieldPaths(entity: EntityIdentity): Promise<FieldHint[]> {
      const entry = samplesByEntity[entity.entityName];
      if (!entry) return [];
      if (fallbackLatencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fallbackLatencyMs));
      }
      return fieldHintsFromSample(entry.sample, entry.maxDepth);
    },
  };
}
