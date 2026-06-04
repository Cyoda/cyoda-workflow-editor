import { useEffect, useRef, useState } from "react";
import type { Workflow } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";

export interface WorkflowTabsProps {
  workflows: Workflow[];
  activeWorkflow: string | null;
  onSelect: (name: string) => void;
  onAdd?: () => void;
  onClose?: (name: string) => void;
  onRename?: (from: string, to: string) => void;
  readOnly: boolean;
}

/**
 * Multi-workflow strip per spec §16. Hidden by `WorkflowEditor` when the
 * session has only a single workflow.
 */
export function WorkflowTabs({
  workflows,
  activeWorkflow,
  onSelect,
  onAdd,
  onClose,
  onRename,
  readOnly,
}: WorkflowTabsProps) {
  const messages = useMessages();
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTab !== null) inputRef.current?.select();
  }, [editingTab]);

  const startEditing = (name: string) => {
    if (readOnly || !onRename) return;
    setEditingTab(name);
    setDraftName(name);
  };

  const commitEdit = () => {
    if (editingTab === null) return;
    const trimmed = draftName.trim();
    const isDuplicate = workflows.some(
      (w) => w.name !== editingTab && w.name === trimmed,
    );
    if (trimmed && trimmed !== editingTab && !isDuplicate) {
      onRename?.(editingTab, trimmed);
    }
    setEditingTab(null);
  };

  const cancelEdit = () => setEditingTab(null);

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 12px",
        height: 36,
        borderBottom: "1px solid #E2E8F0",
        background: "#F8FAFC",
        overflowX: "auto",
      }}
      data-testid="workflow-tabs"
    >
      {workflows.map((w) => {
        const active = w.name === activeWorkflow;
        const isEditing = editingTab === w.name;
        return (
          <div
            key={w.name}
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: 4,
              border: `1px solid ${active ? "#0F172A" : "#CBD5E1"}`,
              background: active ? "white" : "transparent",
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                  if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                }}
                data-testid={`tab-rename-input-${w.name}`}
                style={{
                  padding: "3px 8px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  outline: "2px solid #0F172A",
                  outlineOffset: -2,
                  borderRadius: 3,
                  background: "white",
                  minWidth: 60,
                  width: Math.max(60, draftName.length * 8),
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(w.name)}
                onDoubleClick={() => startEditing(w.name)}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  border: "none",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                }}
                data-testid={`tab-${w.name}`}
                title={!readOnly && onRename ? "Double-click to rename" : undefined}
              >
                {w.name || messages.tabs.untitled}
              </button>
            )}
            {onClose && !readOnly && workflows.length > 1 && !isEditing && (
              <button
                type="button"
                onClick={() => onClose(w.name)}
                style={{
                  padding: "0 8px",
                  background: "transparent",
                  border: "none",
                  color: "#64748B",
                  cursor: "pointer",
                  fontSize: 14,
                }}
                aria-label={messages.tabs.closeTab}
                data-testid={`tab-close-${w.name}`}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {onAdd && !readOnly && (
        <button
          type="button"
          onClick={onAdd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            background: "white",
            color: "#2563EB",
            border: "1px solid #2563EB",
            borderRadius: 5,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
          data-testid="tab-add"
        >
          + {messages.toolbar.addWorkflow}
        </button>
      )}
    </nav>
  );
}
