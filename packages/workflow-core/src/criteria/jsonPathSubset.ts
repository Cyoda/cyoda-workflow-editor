// JSONPath subset supported by cyoda-go's gjson translator
// (`internal/match/match.go:40-59`). The engine does NOT run a full JSONPath
// parser: filters and recursive descent silently fail. See spec §5.
//
// Accept: `$`, `$.field`, `$.a.b.c`, `$.list[0]`, `$.list[0].x`,
//         `$.list[*]`, `$.list[*].x`.
// Reject: recursive descent (`..`), filter expressions (`[?(@…)]`),
//         bracketed quoted keys (`['foo']`), missing `$` root, malformed
//         brackets, segment names with whitespace or reserved punctuation.

export type JsonPathRejectReason =
  | "empty"
  | "missing-root"
  | "recursive-descent"
  | "filter-expression"
  | "malformed";

export type JsonPathValidationResult =
  | { ok: true }
  | { ok: false; reason: JsonPathRejectReason };

const SEGMENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const INDEX_RE = /^(?:\d+|\*)$/;

export function validateJsonPathSubset(path: string): JsonPathValidationResult {
  if (path.length === 0) return { ok: false, reason: "empty" };
  if (path[0] !== "$") return { ok: false, reason: "missing-root" };

  // Bare root.
  if (path === "$") return { ok: true };

  let i = 1;
  while (i < path.length) {
    const ch = path[i];

    if (ch === ".") {
      // Recursive descent.
      if (path[i + 1] === ".") return { ok: false, reason: "recursive-descent" };

      // Read a dot-segment.
      i += 1;
      const start = i;
      while (i < path.length && path[i] !== "." && path[i] !== "[") i += 1;
      const segment = path.slice(start, i);
      if (!SEGMENT_RE.test(segment)) return { ok: false, reason: "malformed" };
      continue;
    }

    if (ch === "[") {
      // Filter expression — gjson translator does not rewrite these.
      if (path[i + 1] === "?") return { ok: false, reason: "filter-expression" };
      // Bracketed quoted keys not supported.
      if (path[i + 1] === "'" || path[i + 1] === '"') return { ok: false, reason: "malformed" };

      const end = path.indexOf("]", i);
      if (end === -1) return { ok: false, reason: "malformed" };
      const inner = path.slice(i + 1, end);
      if (!INDEX_RE.test(inner)) return { ok: false, reason: "malformed" };
      i = end + 1;
      continue;
    }

    return { ok: false, reason: "malformed" };
  }

  return { ok: true };
}
