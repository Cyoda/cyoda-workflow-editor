import { createContext, useContext } from "react";
import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-monaco";

const CriterionMonacoContext = createContext<WorkflowJsonMonacoRuntime | null>(null);

export const CriterionMonacoProvider = CriterionMonacoContext.Provider;

/** The Monaco runtime forwarded by WorkflowEditor, or null when none is configured. */
export function useCriterionMonaco(): WorkflowJsonMonacoRuntime | null {
  return useContext(CriterionMonacoContext);
}
