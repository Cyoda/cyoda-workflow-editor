import { ANNOTATIONS_MAX_BYTES } from "@cyoda/workflow-core";

export interface AnnotationsJsonResult {
  annotations: Record<string, unknown> | null;
  error: string | null;
}

export function annotationsModelUri(key: string): string {
  return `cyoda://annotations/${key}.json`;
}

/** Compacted UTF-8 byte length — identical measure to the save-time backstop. */
export function annotationBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Value equality for JSON (ignores formatting/whitespace). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function parseAnnotationsJson(text: string): AnnotationsJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { annotations: null, error: "Invalid JSON." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { annotations: null, error: "Annotations must be a JSON object." };
  }
  const bytes = annotationBytes(raw);
  if (bytes > ANNOTATIONS_MAX_BYTES) {
    return {
      annotations: null,
      error: `Annotations are ${bytes} bytes, over the ${ANNOTATIONS_MAX_BYTES}-byte limit.`,
    };
  }
  return { annotations: raw as Record<string, unknown>, error: null };
}
