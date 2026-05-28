export {
  CRITERION_DEPTH_WARNING_THRESHOLD,
  MAX_CRITERION_DEPTH,
  OPERATOR_GROUPS,
  OPERATOR_VALUE_SHAPE,
  SUPPORTED_GROUP_OPERATORS,
  SUPPORTED_SIMPLE_OPERATORS,
  UNSUPPORTED_OPERATORS,
} from "./operators.js";
export type { OperatorGroup, OperatorGroupId, OperatorValueShape } from "./operators.js";

export { validateJsonPathSubset } from "./jsonPathSubset.js";
export type { JsonPathRejectReason, JsonPathValidationResult } from "./jsonPathSubset.js";

export { describeCriterion } from "./describe.js";
