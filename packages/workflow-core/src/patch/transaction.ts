import type { WorkflowEditorDocument } from "../types/editor.js";
import type { PatchTransaction } from "../types/transaction.js";
import { applyPatch } from "./apply.js";
import { invertPatch } from "./invert.js";

/**
 * Apply all patches in a transaction in sequence and return the resulting doc.
 */
export function applyTransaction(
  doc: WorkflowEditorDocument,
  tx: PatchTransaction,
): WorkflowEditorDocument {
  return tx.patches.reduce((d, p) => applyPatch(d, p), doc);
}

/**
 * Build the inverse of a transaction.
 *
 * Convention: `tx.inverses` contains the inverse patches in UNDO-APPLICATION
 * ORDER (i.e. the last patch is undone first). `invertTransaction` simply uses
 * `tx.inverses` as the forward patches of the returned transaction.
 *
 * If `tx.inverses` is empty, falls back to computing each inverse
 * individually from `doc` and reversing to get the correct undo order.
 */
export function invertTransaction(
  doc: WorkflowEditorDocument,
  tx: PatchTransaction,
): PatchTransaction {
  if (tx.inverses.length > 0) {
    return {
      summary: `Undo: ${tx.summary}`,
      patches: tx.inverses,
      inverses: tx.patches,
    };
  }
  // Fallback: compute inverses per patch then reverse to get undo-application order.
  const computed = tx.patches.map((p) => invertPatch(doc, p)).reverse();
  return {
    summary: `Undo: ${tx.summary}`,
    patches: computed,
    inverses: tx.patches,
  };
}
