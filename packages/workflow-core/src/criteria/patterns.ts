// Operand checks cyoda-go 0.8.4 performs on criteria at workflow import.

/**
 * A `LIKE` operand is invalid when it ends in an unpaired escape: `\` escapes
 * the character after it, so a trailing lone `\` has nothing to escape
 * (cyoda-go: "pattern ends with an unpaired escape"). Spell a literal trailing
 * backslash `\\`. Exact mirror of the server rule; non-string operands are
 * left to other checks.
 */
export function likePatternError(operand: unknown): string | null {
  if (typeof operand !== "string") return null;
  for (let i = 0; i < operand.length; i++) {
    if (operand[i] !== "\\") continue;
    if (i + 1 >= operand.length) return "pattern ends with an unpaired escape";
    i += 1;
  }
  return null;
}

/**
 * Best-effort check that a `MATCHES_PATTERN` operand is a valid RE2 pattern.
 * cyoda-go compiles the anchored form `\A(?:operand)\z` with Go's RE2, which
 * JavaScript cannot reproduce exactly, so this only flags constructs RE2 is
 * known to reject plus anything that fails to compile as a JS regex once the
 * RE2-only syntax (`(?P<name>`, inline flag groups) is rewritten. Returns a
 * reason, or null when no problem was detected — null is not a guarantee.
 */
export function matchesPatternIssue(operand: unknown): string | null {
  if (typeof operand !== "string") return null;
  const structural = re2StructuralIssue(operand);
  if (structural) return structural;
  const js = operand
    .replace(/\\Q([\s\S]*?)\\E/g, (_m, lit: string) => lit.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .replace(/\(\?P</g, "(?<")
    .replace(/\(\?[imsU-]+\)/g, "")
    .replace(/\(\?[imsU-]+:/g, "(?:");
  try {
    new RegExp(js);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "invalid regular expression";
  }
}

/**
 * Scan for constructs RE2 rejects, honouring escapes (`\(` is a literal) and
 * character classes (`[(?=]` is a set, not a lookahead).
 */
function re2StructuralIssue(p: string): string | null {
  let inClass = false;
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "\\") {
      const n = p[i + 1];
      if (n === "Q") {
        const end = p.indexOf("\\E", i + 2);
        if (end === -1) return "an unterminated \\Q quotes the anchor cyoda-go wraps the pattern in";
        i = end + 2;
        continue;
      }
      if (!inClass && n !== undefined && n >= "1" && n <= "9") {
        return "backreferences are not supported by RE2";
      }
      i += 2;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      i += 1;
      continue;
    }
    if (c === "[") {
      inClass = true;
      i += 1;
      if (p[i] === "^") i += 1;
      if (p[i] === "]") i += 1; // a leading `]` is a literal member
      continue;
    }
    if (c === "(" && p[i + 1] === "?") {
      const k = p[i + 2] === "<" ? p[i + 3] : p[i + 2];
      if (k === "=" || k === "!") return "lookaround assertions are not supported by RE2";
    }
    i += 1;
  }
  return null;
}

// Shapes cyoda-go parses into a temporal type for `creationDate` /
// `lastUpdateTime` (verified against 0.8.4): a year, year-month or date; a
// date-time with optional seconds/fraction and optional `Z`/`±HH:MM` offset;
// or a zone-less time of day. Coarse operands upscale on the server.
const TEMPORAL_DATE_RE =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
const TEMPORAL_TIME_RE = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** True when `operand` looks like a value cyoda-go parses as temporal. */
export function isTemporalOperand(operand: unknown): boolean {
  return (
    typeof operand === "string" &&
    (TEMPORAL_DATE_RE.test(operand) || TEMPORAL_TIME_RE.test(operand))
  );
}
