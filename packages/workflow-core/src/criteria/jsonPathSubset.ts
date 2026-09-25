// JSONPath grammar cyoda-go enforces on criterion `jsonPath` (simple and array
// clauses) at workflow import, as of 0.8.4 (`docs/cloud-parity/path-grammar.md`):
//
//   jsonPath  = "$." segment ( "." segment )*
//   segment   = name subscript*
//   name      = 1*( ALPHA / DIGIT / "_" / "-" )   ; ASCII only
//   subscript = "[" ( "*" / 1*DIGIT ) "]"          ; the digit run must fit an int32
//
// Accept: `$.field`, `$.a.b.c`, `$.list[0]`, `$.list[*].x`, `$.1a`, `$.m[*][*]`.
// Reject: bare `$`, a missing `$.` leader, recursive descent (`..`), filter
//         expressions (`[?(@…)]`), bracketed quoted keys (`['foo']`), slices,
//         negative indices, empty/trailing segments, non-ASCII names.

export type JsonPathRejectReason =
  | "empty"
  | "missing-root"
  | "bare-root"
  | "recursive-descent"
  | "filter-expression"
  | "index-out-of-range"
  | "malformed";

export type JsonPathValidationResult =
  | { ok: true }
  | { ok: false; reason: JsonPathRejectReason };

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const INDEX_RE = /^(?:\d+|\*)$/;
const INT32_MAX = 2147483647;

export function validateJsonPathSubset(path: string): JsonPathValidationResult {
  if (path.length === 0) return { ok: false, reason: "empty" };
  if (path[0] !== "$") return { ok: false, reason: "missing-root" };
  if (path === "$") return { ok: false, reason: "bare-root" };
  if (path[1] !== ".") return { ok: false, reason: "malformed" };

  let i = 1;
  while (i < path.length) {
    // Every segment starts with a dot.
    if (path[i] !== ".") return { ok: false, reason: "malformed" };
    if (path[i + 1] === ".") return { ok: false, reason: "recursive-descent" };

    i += 1;
    const start = i;
    while (i < path.length && path[i] !== "." && path[i] !== "[") i += 1;
    if (!NAME_RE.test(path.slice(start, i))) return { ok: false, reason: "malformed" };

    while (path[i] === "[") {
      if (path[i + 1] === "?") return { ok: false, reason: "filter-expression" };
      const end = path.indexOf("]", i);
      if (end === -1) return { ok: false, reason: "malformed" };
      const inner = path.slice(i + 1, end);
      if (!INDEX_RE.test(inner)) return { ok: false, reason: "malformed" };
      if (inner !== "*" && Number(inner) > INT32_MAX) {
        return { ok: false, reason: "index-out-of-range" };
      }
      i = end + 1;
    }
  }

  return { ok: true };
}
