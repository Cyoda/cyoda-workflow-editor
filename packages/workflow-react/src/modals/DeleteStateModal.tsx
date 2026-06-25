import { useEffect, useMemo, useRef } from "react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { colors, fonts, radii } from "../style/tokens.js";

export interface DeleteStateModalProps {
  document: WorkflowEditorDocument;
  workflow: string;
  stateCode: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function countAffected(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): { outgoing: number; incoming: number } {
  let outgoing = 0;
  let incoming = 0;
  const wf = doc.session.workflows.find((w) => w.name === workflow);
  if (!wf) return { outgoing, incoming };
  for (const [code, state] of Object.entries(wf.states)) {
    for (const t of state.transitions) {
      if (code === stateCode) outgoing++;
      if (t.next === stateCode && code !== stateCode) incoming++;
    }
  }
  return { outgoing, incoming };
}

/** Cascading-delete confirmation per spec §11.7. */
export function DeleteStateModal({
  document: doc,
  workflow,
  stateCode,
  onConfirm,
  onCancel,
}: DeleteStateModalProps) {
  const messages = useMessages();
  const counts = useMemo(
    () => countAffected(doc, workflow, stateCode),
    [doc, workflow, stateCode],
  );
  return (
    <ModalFrame onCancel={onCancel}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{messages.confirmDelete.title}</h2>
      <p style={{ margin: "12px 0", fontSize: 13, color: colors.textSecondary }}>
        {messages.confirmDelete.message}
      </p>
      <div style={{ padding: 8, background: colors.surfaceMuted, border: `1px solid ${colors.borderSubtle}`, borderRadius: radii.sm, fontSize: 13 }}>
        <strong>{stateCode}</strong>
        <div style={{ color: colors.textSecondary }}>
          {messages.confirmDelete.transitionsAffected}: {counts.outgoing + counts.incoming}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={ghostBtn} data-testid="modal-delete-cancel">
          {messages.confirmDelete.cancel}
        </button>
        <button type="button" onClick={onConfirm} style={dangerBtn} data-testid="modal-delete-confirm">
          {messages.confirmDelete.confirm}
        </button>
      </div>
    </ModalFrame>
  );
}

export function ModalFrame({
  children,
  onCancel,
  labelledBy,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  labelledBy?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const node = frameRef.current;
    if (node) {
      const focusable = node.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? node).focus();
    }
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  return (
    <div
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      data-testid="modal-backdrop"
    >
      <div
        ref={frameRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: radii.md,
          padding: 20,
          minWidth: 340,
          boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
          outline: "none",
          fontFamily: fonts.sans,
          color: colors.textPrimary,
        }}
        data-testid="modal-frame"
      >
        {children}
      </div>
    </div>
  );
}

const ghostBtn = {
  padding: "6px 12px",
  background: "white",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 13,
  cursor: "pointer",
};
const dangerBtn = {
  ...ghostBtn,
  background: colors.danger,
  color: "white",
  borderColor: colors.danger,
};
