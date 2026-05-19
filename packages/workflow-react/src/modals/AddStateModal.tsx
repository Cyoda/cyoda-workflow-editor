import { useEffect, useRef, useState } from "react";
import { NAME_REGEX } from "@cyoda/workflow-core";
import { ModalFrame } from "./DeleteStateModal.js";

export interface AddStateModalProps {
  existingNames: string[];
  onCreate: (name: string) => void;
  onCancel: () => void;
}

function generateName(existing: string[]): string {
  let n = 1;
  while (existing.includes(`state${n}`)) n++;
  return `state${n}`;
}

export function AddStateModal({ existingNames, onCreate, onCancel }: AddStateModalProps) {
  const [name, setName] = useState(() => generateName(existingNames));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const validate = (v: string): string | null => {
    const trimmed = v.trim();
    if (!trimmed) return "Name is required";
    if (!NAME_REGEX.test(trimmed)) return "Must start with a letter and contain only letters, numbers, and underscores";
    if (existingNames.includes(trimmed)) return `State "${trimmed}" already exists`;
    return null;
  };

  const handleSubmit = () => {
    const err = validate(name);
    if (err) { setError(err); return; }
    onCreate(name.trim());
  };

  return (
    <ModalFrame onCancel={onCancel} labelledBy="add-state-title">
      <h2 id="add-state-title" style={{ margin: 0, fontSize: 16 }}>
        Add State
      </h2>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="add-state-name-input" style={{ fontSize: 12, color: "#475569" }}>
          State name
        </label>
        <input
          ref={inputRef}
          id="add-state-name-input"
          type="text"
          value={name}
          aria-invalid={error !== null}
          aria-describedby={error ? "add-state-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          data-testid="add-state-name-input"
          style={{
            padding: "6px 8px",
            fontSize: 14,
            border: `1px solid ${error ? "#FCA5A5" : "#CBD5E1"}`,
            borderRadius: 4,
            background: "white",
          }}
        />
        {error && (
          <div
            id="add-state-error"
            role="alert"
            style={{ color: "#B91C1C", fontSize: 12 }}
          >
            {error}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <button
          type="button"
          onClick={onCancel}
          style={ghostBtn}
          data-testid="add-state-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          style={primaryBtn}
          data-testid="add-state-confirm"
        >
          Add State
        </button>
      </div>
    </ModalFrame>
  );
}

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
