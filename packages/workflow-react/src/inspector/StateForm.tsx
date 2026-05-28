import { useState } from "react";
import type { DomainPatch, State, ValidationIssue, Workflow } from "@cyoda/workflow-core";
import { NAME_REGEX } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { FieldGroup, TextField } from "./fields.js";

export function StateForm({
  workflow,
  stateCode,
  state,
  disabled,
  issues,
  onDispatch,
  onRequestDelete,
}: {
  workflow: Workflow;
  stateCode: string;
  state: State;
  disabled: boolean;
  issues?: ValidationIssue[];
  onDispatch: (patch: DomainPatch) => void;
  onRequestDelete: () => void;
}) {
  const messages = useMessages();
  const [renameError, setRenameError] = useState<string | null>(null);

  const outgoing = state.transitions.length;
  const incoming = Object.values(workflow.states).reduce(
    (n, s) => n + s.transitions.filter((t) => t.next === stateCode).length,
    0,
  );
  const isInitial = workflow.initialState === stateCode;
  const isTerminal = outgoing === 0 && !isInitial;
  const reachable = reachableStates(workflow);
  const isUnreachable = !isInitial && !reachable.has(stateCode);

  const handleRename = (next: string) => {
    if (next === stateCode) return;
    setRenameError(null);
    if (!NAME_REGEX.test(next)) {
      setRenameError(`"${next}" is not a valid state name`);
      return;
    }
    if (next in workflow.states) {
      setRenameError(`State "${next}" already exists`);
      return;
    }
    onDispatch({ op: "renameState", workflow: workflow.name, from: stateCode, to: next });
  };

  return (
    <FieldGroup title={messages.inspector.properties}>
      <TextField
        label={messages.inspector.name}
        value={stateCode}
        disabled={disabled}
        onCommit={handleRename}
        testId="inspector-state-name"
      />
      {renameError && (
        <div role="alert" style={{ color: "#B91C1C", fontSize: 12 }}>
          {renameError}
        </div>
      )}
      {(isInitial || isTerminal || isUnreachable) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isInitial && <StateBadge color="#15803d" bg="#f0fdf4" label="Initial" />}
          {isTerminal && <StateBadge color="#0369a1" bg="#eff6ff" label="Terminal" />}
          {isUnreachable && <StateBadge color="#b45309" bg="#fffbeb" label="Unreachable" />}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#475569" }}>
        {outgoing} outgoing · {incoming} incoming
      </div>
      {!isInitial && !disabled && (
        <button
          type="button"
          onClick={() =>
            onDispatch({ op: "setInitialState", workflow: workflow.name, stateCode })
          }
          style={ghostBtn}
          data-testid="inspector-state-set-initial"
        >
          Set as Initial State
        </button>
      )}
      {issues && issues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {issues.map((issue, i) => (
            <div
              key={`${issue.code}-${i}`}
              role="alert"
              style={{
                padding: "4px 8px",
                background: issue.severity === "error" ? "#FEF2F2" : "#FFFBEB",
                border: `1px solid ${issue.severity === "error" ? "#FCA5A5" : "#FCD34D"}`,
                borderRadius: 4,
                fontSize: 12,
                color: issue.severity === "error" ? "#B91C1C" : "#B45309",
              }}
            >
              {issue.message}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={disabled}
        data-testid="inspector-state-delete"
        style={dangerBtn}
      >
        Delete state…
      </button>
    </FieldGroup>
  );
}

function StateBadge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        background: bg,
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function reachableStates(wf: Workflow): Set<string> {
  const visited = new Set<string>();
  if (!(wf.initialState in wf.states)) return visited;
  const queue = [wf.initialState];
  visited.add(wf.initialState);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const t of wf.states[cur]?.transitions ?? []) {
      if (!visited.has(t.next) && t.next in wf.states) {
        visited.add(t.next);
        queue.push(t.next);
      }
    }
  }
  return visited;
}

const ghostBtn = {
  alignSelf: "flex-start" as const,
  padding: "5px 10px",
  background: "white",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
};

const dangerBtn = {
  alignSelf: "flex-start" as const,
  padding: "6px 10px",
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
  color: "#B91C1C",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
};
