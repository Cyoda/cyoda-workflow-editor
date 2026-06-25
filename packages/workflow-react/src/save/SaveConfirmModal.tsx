import { useState } from "react";
import type { ImportMode, WorkflowEditorDocument } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { colors, fonts, radii } from "../style/tokens.js";
import { ModalFrame } from "../modals/DeleteStateModal.js";

export interface SaveConfirmModalProps {
  mode: ImportMode;
  requiresExplicitConfirm: boolean;
  warningCount: number;
  document: WorkflowEditorDocument;
  /** Summary of changes vs. server state — rendered verbatim above the
   *  confirm button. Callers who have not fetched server state pass null. */
  diffSummary?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Save confirmation modal per spec §17.3 + §18.5.
 *
 *  - REPLACE / ACTIVATE require a tick on "I understand this replaces /
 *    activates server state" before the confirm button enables.
 *  - When warnings are present, a separate tick is required acknowledging
 *    the warning count.
 *  - The diff summary (if provided) is shown above the tick-boxes.
 */
export function SaveConfirmModal({
  mode,
  requiresExplicitConfirm,
  warningCount,
  diffSummary,
  onConfirm,
  onCancel,
}: SaveConfirmModalProps) {
  const messages = useMessages();
  const [ackMode, setAckMode] = useState(!requiresExplicitConfirm);
  const [ackWarnings, setAckWarnings] = useState(warningCount === 0);
  const blocked = !ackMode || !ackWarnings;

  return (
    <ModalFrame onCancel={onCancel}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{messages.saveConfirm.title}</h2>
      <p style={{ margin: "12px 0", fontSize: 13, color: colors.textSecondary }}>
        {messages.saveConfirm.modeLabel}: <strong>{mode}</strong>
      </p>
      {diffSummary && (
        <pre
          style={{
            fontFamily: fonts.mono,
            background: colors.surfaceMuted,
            border: `1px solid ${colors.borderSubtle}`,
            padding: 8,
            borderRadius: radii.sm,
            fontSize: 12,
            margin: "8px 0",
            maxHeight: 160,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
          data-testid="save-diff-summary"
        >
          {diffSummary}
        </pre>
      )}
      {requiresExplicitConfirm && (
        <label style={checkRow} data-testid="save-ack-mode">
          <input
            type="checkbox"
            checked={ackMode}
            onChange={(e) => setAckMode(e.target.checked)}
          />
          <span>
            {mode === "REPLACE"
              ? messages.saveConfirm.ackReplace
              : messages.saveConfirm.ackActivate}
          </span>
        </label>
      )}
      {warningCount > 0 && (
        <label style={checkRow} data-testid="save-ack-warnings">
          <input
            type="checkbox"
            checked={ackWarnings}
            onChange={(e) => setAckWarnings(e.target.checked)}
          />
          <span>
            {messages.saveConfirm.ackWarnings.replace("{count}", String(warningCount))}
          </span>
        </label>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={ghostBtn} data-testid="save-cancel">
          {messages.saveConfirm.cancel}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={onConfirm}
          style={primaryBtn}
          data-testid="save-confirm"
        >
          {messages.saveConfirm.confirm}
        </button>
      </div>
    </ModalFrame>
  );
}

const checkRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: colors.textPrimary,
  margin: "8px 0",
};
const ghostBtn = {
  padding: "6px 12px",
  background: "white",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 13,
  cursor: "pointer",
};
const primaryBtn = {
  ...ghostBtn,
  background: colors.primary,
  color: "white",
  borderColor: colors.primary,
};
