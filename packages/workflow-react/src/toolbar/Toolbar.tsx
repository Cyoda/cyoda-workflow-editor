import type { ValidationIssue } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import type { DerivedState } from "../state/derive.js";
import { severityTone } from "../style/tokens.js";

export type IssueSeverity = ValidationIssue["severity"];

export interface ToolbarProps {
  derived: DerivedState;
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  saveDisabled?: boolean;
  /** Severity whose issues drawer is currently open, if any. */
  openIssueSeverity?: IssueSeverity | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;
  onAddState?: () => void;
  onAddComment?: () => void;
  onResetLayout?: () => void;
  onAutoLayout?: () => void;
  onIssueBadgeClick?: (severity: IssueSeverity) => void;
}

export function Toolbar({
  derived,
  canUndo,
  canRedo,
  readOnly,
  saveDisabled = false,
  openIssueSeverity = null,
  onUndo,
  onRedo,
  onSave,
  onAddState,
  onAddComment,
  onResetLayout,
  onAutoLayout,
  onIssueBadgeClick,
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
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo || readOnly}
        style={btnStyle}
        data-testid="toolbar-undo"
      >
        {messages.toolbar.undo}
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo || readOnly}
        style={btnStyle}
        data-testid="toolbar-redo"
      >
        {messages.toolbar.redo}
      </button>
      {!readOnly && onAddState && (
        <button
          type="button"
          onClick={onAddState}
          style={{ ...btnStyle, background: "#0F172A", color: "white", borderColor: "#0F172A" }}
          data-testid="toolbar-add-state"
          title="Add State (A)"
        >
          {messages.toolbar.addState}
        </button>
      )}
      {!readOnly && onAddComment && (
        <button
          type="button"
          onClick={onAddComment}
          style={btnStyle}
          data-testid="toolbar-add-comment"
          title="Add canvas comment"
        >
          {messages.toolbar.addNote}
        </button>
      )}
      {!readOnly && onAutoLayout && (
        <button
          type="button"
          onClick={onAutoLayout}
          style={btnStyle}
          data-testid="toolbar-auto-layout"
          title="Re-run automatic layout (L)"
        >
          {messages.toolbar.autoLayout}
        </button>
      )}
      {!readOnly && onResetLayout && (
        <button
          type="button"
          onClick={onResetLayout}
          style={btnStyle}
          data-testid="toolbar-reset-layout"
          title="Reset all manual positions (Shift+L)"
        >
          {messages.toolbar.resetLayout}
        </button>
      )}
      <div style={{ flex: 1 }} />
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
