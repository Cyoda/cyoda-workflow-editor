import type { ValidationIssue } from "@cyoda/workflow-core";
import type { ReactNode } from "react";
import { useMessages } from "../i18n/context.js";
import type { DerivedState } from "../state/derive.js";
import { severityTone } from "../style/tokens.js";

export type IssueSeverity = ValidationIssue["severity"];

export interface ToolbarProps {
  derived: DerivedState;
  readOnly: boolean;
  saveDisabled?: boolean;
  /** Severity whose issues drawer is currently open, if any. */
  openIssueSeverity?: IssueSeverity | null;
  onSave?: () => void;
  onIssueBadgeClick?: (severity: IssueSeverity) => void;
  toolbarStart?: ReactNode;
  toolbarCenter?: ReactNode;
  toolbarEnd?: ReactNode;
}

export function Toolbar({
  derived,
  readOnly,
  saveDisabled = false,
  openIssueSeverity = null,
  onSave,
  onIssueBadgeClick,
  toolbarStart,
  toolbarCenter,
  toolbarEnd,
}: ToolbarProps) {
  const messages = useMessages();
  return (
    <header
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #E2E8F0",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "white",
      }}
      data-testid="toolbar"
    >
      {toolbarStart && <div style={slotStyle} data-testid="toolbar-start">{toolbarStart}</div>}
      {toolbarCenter && <div style={{ ...slotStyle, flex: 1, justifyContent: "center" }} data-testid="toolbar-center">{toolbarCenter}</div>}
      {!toolbarCenter && <div style={{ flex: 1 }} />}
      <span role="status" aria-live="polite" style={{ display: "inline-flex", gap: 6 }}>
        <ValidationPill
          severity="error"
          count={derived.errorCount}
          label={messages.toolbar.errors}
          openLabel={messages.issues.openErrors}
          isOpen={openIssueSeverity === "error"}
          onClick={onIssueBadgeClick}
          testId="toolbar-errors"
        />
        <ValidationPill
          severity="warning"
          count={derived.warningCount}
          label={messages.toolbar.warnings}
          openLabel={messages.issues.openWarnings}
          isOpen={openIssueSeverity === "warning"}
          onClick={onIssueBadgeClick}
          testId="toolbar-warnings"
        />
        <ValidationPill
          severity="info"
          count={derived.infoCount}
          label={messages.toolbar.infos}
          openLabel={messages.issues.openInfos}
          isOpen={openIssueSeverity === "info"}
          onClick={onIssueBadgeClick}
          testId="toolbar-infos"
        />
      </span>
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={readOnly || saveDisabled}
          style={{ ...btnStyle, background: "#0F172A", color: "white", borderColor: "#0F172A" }}
          data-testid="toolbar-save"
        >
          {messages.toolbar.save}
        </button>
      )}
      {toolbarEnd && <div style={slotStyle} data-testid="toolbar-end">{toolbarEnd}</div>}
    </header>
  );
}

function ValidationPill({
  severity,
  count,
  label,
  openLabel,
  isOpen,
  onClick,
  testId,
}: {
  severity: IssueSeverity;
  count: number;
  label: string;
  openLabel: string;
  isOpen: boolean;
  onClick?: (severity: IssueSeverity) => void;
  testId: string;
}) {
  const tone = severityTone(severity);
  const interactive = count > 0 && !!onClick;
  return (
    <button
      type="button"
      onClick={interactive ? () => onClick!(severity) : undefined}
      disabled={!interactive}
      aria-haspopup={interactive ? "dialog" : undefined}
      aria-expanded={interactive ? isOpen : undefined}
      aria-label={`${count} ${label}${interactive ? ` — ${openLabel}` : ""}`}
      data-testid={testId}
      style={{
        padding: "3px 8px",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.fg,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: interactive ? "pointer" : "default",
        opacity: interactive ? 1 : 0.7,
        outline: isOpen ? `2px solid ${tone.fg}` : "none",
        outlineOffset: 1,
      }}
    >
      {count} {label}
    </button>
  );
}

const btnStyle = {
  padding: "4px 10px",
  background: "white",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
};

const slotStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};
