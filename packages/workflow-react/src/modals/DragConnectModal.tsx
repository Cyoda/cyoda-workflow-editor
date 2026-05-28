import { useState } from "react";
import { NAME_REGEX, type State } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { ModalFrame } from "./DeleteStateModal.js";

export interface DragConnectModalProps {
  source: State;
  fromState: string;
  toState: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
}

function generateDefault(toState: string, existing: Set<string>): string {
  const base = `to_${toState}`;
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Drag-connect modal per spec §11.5. Requires a named transition — cancel
 * must not create an anonymous transition. */
export function DragConnectModal({
  source,
  fromState,
  toState,
  onCreate,
  onCancel,
}: DragConnectModalProps) {
  const messages = useMessages();
  const existing = new Set(source.transitions.map((t) => t.name));
  const [name, setName] = useState(() => generateDefault(toState, existing));
  const invalidFormat = !!name && !NAME_REGEX.test(name);
  const duplicate = existing.has(name);
  const blocked = name.length === 0 || invalidFormat || duplicate;

  return (
    <ModalFrame onCancel={onCancel}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{messages.dragConnect.title}</h2>
      <p style={{ margin: "6px 0 14px", fontSize: 12, color: "#475569" }}>
        {fromState} → {toState}
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#475569" }}>{messages.dragConnect.transitionName}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !blocked) onCreate(name); }}
          style={{
            padding: "6px 8px",
            fontSize: 13,
            border: "1px solid #CBD5E1",
            borderRadius: 4,
          }}
          data-testid="dragconnect-name"
          autoFocus
        />
      </label>
      {invalidFormat && (
        <div style={errorMsg} data-testid="dragconnect-error-format">
          {messages.dragConnect.invalidName}
        </div>
      )}
      {duplicate && (
        <div style={errorMsg} data-testid="dragconnect-error-duplicate">
          {messages.dragConnect.duplicateName}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={ghostBtn} data-testid="dragconnect-cancel">
          {messages.dragConnect.cancel}
        </button>
        <button
          type="button"
          onClick={() => !blocked && onCreate(name)}
          disabled={blocked}
          style={primaryBtn}
          data-testid="dragconnect-create"
        >
          {messages.dragConnect.create}
        </button>
      </div>
    </ModalFrame>
  );
}

const errorMsg = {
  marginTop: 6,
  fontSize: 12,
  color: "#B91C1C",
};
const ghostBtn = {
  padding: "6px 12px",
  background: "white",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
};
const primaryBtn = {
  ...ghostBtn,
  background: "#0F172A",
  color: "white",
  borderColor: "#0F172A",
};
