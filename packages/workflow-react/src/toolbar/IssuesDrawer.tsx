import { useEffect, useMemo, useRef } from "react";
import type {
  ValidationIssue,
  WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import type { Selection } from "../state/types.js";
import { colors, radii, severityTone } from "../style/tokens.js";

export type IssueSeverity = ValidationIssue["severity"];

export interface IssuesDrawerProps {
  open: boolean;
  severity: IssueSeverity;
  issues: ValidationIssue[];
  document: WorkflowEditorDocument;
  onClose: () => void;
  onJumpTo: (selection: Selection) => void;
}

interface ResolvedTarget {
  selection: Selection;
  kind: "workflow" | "state" | "transition" | "processor";
  label: string;
}

function resolveTarget(
  doc: WorkflowEditorDocument,
  targetId: string | undefined,
): ResolvedTarget | null {
  if (!targetId) return null;
  const ids = doc.meta.ids;
  const statePtr = ids.states[targetId];
  if (statePtr) {
    return {
      selection: {
        kind: "state",
        workflow: statePtr.workflow,
        stateCode: statePtr.state,
        nodeId: targetId,
      },
      kind: "state",
      label: `${statePtr.workflow} › ${statePtr.state}`,
    };
  }
  const transitionPtr = ids.transitions[targetId];
  if (transitionPtr) {
    return {
      selection: { kind: "transition", transitionUuid: targetId },
      kind: "transition",
      label: `${transitionPtr.workflow} › ${transitionPtr.state}`,
    };
  }
  const processorPtr = ids.processors[targetId];
  if (processorPtr) {
    return {
      selection: { kind: "processor", processorUuid: targetId },
      kind: "processor",
      label: `${processorPtr.workflow} › ${processorPtr.state} (processor)`,
    };
  }
  for (const [name, uuid] of Object.entries(ids.workflows)) {
    if (uuid === targetId) {
      return {
        selection: { kind: "workflow", workflow: name },
        kind: "workflow",
        label: name,
      };
    }
  }
  return null;
}

export function IssuesDrawer({
  open,
  severity,
  issues,
  document: doc,
  onClose,
  onJumpTo,
}: IssuesDrawerProps) {
  const messages = useMessages();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    function onClick(e: MouseEvent) {
      const node = ref.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-testid^=toolbar-]")) return;
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  const filtered = useMemo(
    () => issues.filter((i) => i.severity === severity),
    [issues, severity],
  );
  const title = useMemo(() => {
    if (severity === "error") return messages.issues.errors;
    if (severity === "warning") return messages.issues.warnings;
    return messages.issues.infos;
  }, [severity, messages]);
  const tone = severityTone(severity);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      data-testid="issues-drawer"
      data-severity={severity}
      style={{
        position: "absolute",
        top: 48,
        right: 12,
        zIndex: 30,
        width: 360,
        maxHeight: 420,
        overflowY: "auto",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        boxShadow: "0 4px 16px rgba(15,23,42,0.16)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${colors.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 999,
            background: tone.fg,
          }}
          aria-hidden
        />
        <strong style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}>
          {title} · {filtered.length}
        </strong>
        <button
          type="button"
          onClick={onClose}
          aria-label={messages.issues.close}
          data-testid="issues-drawer-close"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: colors.textSecondary,
            padding: 0,
            width: 24,
            height: 24,
          }}
        >
          ×
        </button>
      </header>
      {filtered.length === 0 ? (
        <p
          style={{ padding: 12, color: colors.textTertiary, fontSize: 12, margin: 0 }}
          data-testid="issues-drawer-empty"
        >
          {messages.issues.none}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {filtered.map((issue, idx) => {
            const target = resolveTarget(doc, issue.targetId);
            const targetLabel = target
              ? target.kind === "transition"
                ? `${messages.issues.relatedTransition}: ${target.label}`
                : target.kind === "state"
                  ? `${messages.issues.relatedState}: ${target.label}`
                  : target.label
              : null;
            return (
              <li
                key={`${issue.code}-${idx}`}
                style={{
                  border: `1px solid ${colors.borderSubtle}`,
                  borderRadius: radii.sm,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  background: tone.bg,
                }}
                data-testid={`issues-drawer-item-${idx}`}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: tone.fg }}>
                  {issue.code}
                </div>
                <div style={{ fontSize: 12, color: colors.textPrimary }}>
                  {issue.message}
                </div>
                {targetLabel && (
                  <div style={{ fontSize: 11, color: colors.textSecondary }}>
                    {targetLabel}
                  </div>
                )}
                {target && (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        onJumpTo(target.selection);
                        onClose();
                      }}
                      data-testid={`issues-drawer-jump-${idx}`}
                      style={{
                        marginTop: 4,
                        padding: "2px 8px",
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                        borderRadius: radii.sm,
                        fontSize: 11,
                        cursor: "pointer",
                        color: colors.textPrimary,
                      }}
                    >
                      {messages.issues.jumpTo}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
