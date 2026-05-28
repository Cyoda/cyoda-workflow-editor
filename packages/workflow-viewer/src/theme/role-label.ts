import type { StateNode } from "@cyoda/workflow-graph";

/**
 * Category label shown in the small uppercase header line above the state
 * title. Derived from projection data (role + visual category).
 *
 * Reused by the editor shell so the website viewer and editor canvas display
 * identical headers.
 */
export function roleCategoryLabel(node: StateNode): string {
  if (node.role === "initial" || node.role === "initial-terminal") return "INITIAL";
  if (node.role === "terminal") return "TERMINAL";
  if (node.category === "MANUAL_REVIEW") return "MANUAL REVIEW";
  if (node.category === "PROCESSING_STATE") return "PROCESSING";
  return "STATE";
}
