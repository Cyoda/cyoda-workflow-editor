import type { DomainPatch, Workflow } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { CheckboxField, FieldGroup, TextField } from "./fields.js";
import { AnnotationsField } from "./AnnotationsField.js";

export function WorkflowForm({
  workflow,
  disabled,
  onDispatch,
}: {
  workflow: Workflow;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
}) {
  const messages = useMessages();
  return (
    <FieldGroup title={messages.inspector.properties}>
      <TextField
        label={messages.inspector.name}
        value={workflow.name}
        disabled={disabled}
        onCommit={(next) =>
          next !== workflow.name && onDispatch({ op: "renameWorkflow", from: workflow.name, to: next })
        }
        testId="inspector-workflow-name"
      />
      <TextField
        label={messages.inspector.version}
        value={workflow.version}
        entityKey={workflow.name}
        disabled={disabled}
        onCommit={(next) =>
          onDispatch({
            op: "updateWorkflowMeta",
            workflow: workflow.name,
            updates: { version: next },
          })
        }
        testId="inspector-workflow-version"
      />
      <TextField
        label={messages.inspector.description}
        value={workflow.desc ?? ""}
        entityKey={workflow.name}
        disabled={disabled}
        multiline
        onCommit={(next) =>
          onDispatch({
            op: "updateWorkflowMeta",
            workflow: workflow.name,
            updates: { desc: next === "" ? undefined : next },
          })
        }
        testId="inspector-workflow-desc"
      />
      <CheckboxField
        label={messages.inspector.active}
        checked={workflow.active}
        disabled={disabled}
        onChange={(next) =>
          onDispatch({
            op: "updateWorkflowMeta",
            workflow: workflow.name,
            updates: { active: next },
          })
        }
        testId="inspector-workflow-active"
      />
      <TextField
        label={messages.inspector.initialState}
        value={workflow.initialState}
        entityKey={workflow.name}
        disabled={disabled}
        onCommit={(next) =>
          onDispatch({
            op: "setInitialState",
            workflow: workflow.name,
            stateCode: next,
          })
        }
        testId="inspector-workflow-initial"
      />
      <AnnotationsField
        value={workflow.annotations}
        disabled={disabled}
        modelKey={`workflow-${workflow.name}`}
        onCommit={(annotations) =>
          onDispatch({ op: "setAnnotations", target: { kind: "workflow", workflow: workflow.name }, annotations })
        }
        onRemove={() =>
          onDispatch({ op: "setAnnotations", target: { kind: "workflow", workflow: workflow.name } })
        }
      />
    </FieldGroup>
  );
}
