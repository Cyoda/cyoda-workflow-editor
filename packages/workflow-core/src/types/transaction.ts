import type { DomainPatch } from "./patch.js";

/**
 * A group of patches that form a single logical user action and therefore a
 * single undo step.  The caller is responsible for pre-computing both the
 * forward `patches` and their exact `inverses` (in forward order — the undo
 * machinery reverses and applies them in reverse order at undo time).
 */
export interface PatchTransaction {
  summary: string;
  patches: DomainPatch[];
  inverses: DomainPatch[];
  /** Selection to restore after the transaction is undone. */
  selectionAfter?: unknown;
}

/**
 * Thrown by applyPatch when a patch would create a name collision or other
 * integrity violation.
 */
export class PatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchConflictError";
  }
}
