import type { ReactNode } from "react";
import { workflowPalette } from "@cyoda/workflow-viewer/theme";
import { useMessages } from "../i18n/context.js";
import { ghostBtnStyle } from "../style/tokens.js";
import { ModalFrame } from "./DeleteStateModal.js";

export interface HelpModalProps {
  onCancel: () => void;
}

/** Quick-reference legend for node/transition colors, controls and shortcuts. */
export function HelpModal({ onCancel }: HelpModalProps) {
  const messages = useMessages();
  const h = messages.help;
  const node = workflowPalette.node;
  const edge = workflowPalette.edge;

  return (
    <ModalFrame onCancel={onCancel} labelledBy="workflow-help-title">
      <div style={{ width: 480, maxWidth: "85vw" }}>
        <h2 id="workflow-help-title" style={{ margin: 0, fontSize: 16 }}>
          {h.title}
        </h2>
        <div
          style={{
            marginTop: 12,
            maxHeight: "65vh",
            overflowY: "auto",
            paddingRight: 8,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Section title={h.statesTitle}>
            <ColorRow fill={node.initial.fill} border={node.initial.border} label={h.stateInitial} />
            <ColorRow fill={node.default.fill} border={node.default.border} label={h.stateDefault} />
            <ColorRow fill={node.processing.fill} border={node.processing.border} label={h.stateProcessing} />
            <ColorRow fill={node.manualReview.fill} border={node.manualReview.border} label={h.stateManualReview} />
            <ColorRow fill={node.terminal.fill} border={node.terminal.border} label={h.stateTerminal} />
            <ColorRow fill="#FFFFFF" border="#DC2626" label={h.stateError} />
            <ColorRow fill="#FFFFFF" border="#D97706" label={h.stateWarning} />
          </Section>

          <Section title={h.transitionsTitle}>
            <LineRow color={edge.automated} label={h.transitionAutomated} />
            <LineRow color={edge.manual} dashed label={h.transitionManual} />
            <LineRow color={edge.conditional} label={h.transitionConditional} />
            <LineRow color={edge.processing} label={h.transitionProcessing} />
            <LineRow color={edge.terminal} label={h.transitionTerminal} />
            <LineRow color={edge.loop} label={h.transitionLoop} />
            <LineRow color={edge.disabled} label={h.transitionDisabled} />
          </Section>

          <Section title={h.controlsTitle}>
            <ShortcutRow keys="A" label={h.shortcutAddState} />
            <ShortcutRow keys="L" label={h.shortcutAutoLayout} />
            <ShortcutRow keys="Ctrl/⌘ Z" label={h.shortcutUndo} />
            <ShortcutRow keys="Ctrl/⌘ ⇧ Z" label={h.shortcutRedo} />
            <ShortcutRow keys="Ctrl/⌘ S" label={h.shortcutSave} />
            <ShortcutRow keys="Delete" label={h.shortcutDelete} />
            <ShortcutRow keys="Esc" label={h.shortcutEscape} />
          </Section>

          <Section title={h.tipsTitle}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", display: "flex", flexDirection: "column", gap: 6 }}>
              <li>{h.tipDoubleClick}</li>
              <li>{h.tipConnect}</li>
              <li>{h.tipSelect}</li>
              <li>{h.tipMove}</li>
            </ul>
          </Section>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onCancel} style={ghostBtnStyle} data-testid="help-modal-close">
            {h.close}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#94A3B8",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function ColorRow({ fill, border, label }: { fill: string; border: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1E293B" }}>
      <span
        style={{
          width: 22,
          height: 14,
          borderRadius: 4,
          background: fill,
          border: `1.5px solid ${border}`,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function LineRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1E293B" }}>
      <svg width="28" height="14" style={{ flexShrink: 0 }} aria-hidden="true">
        <line
          x1="2"
          y1="7"
          x2="26"
          y2="7"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          {...(dashed ? { strokeDasharray: "3 3" } : {})}
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#1E293B" }}>
      <kbd
        style={{
          minWidth: 84,
          textAlign: "center",
          padding: "2px 6px",
          background: "#F1F5F9",
          border: "1px solid #CBD5E1",
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          color: "#334155",
          flexShrink: 0,
        }}
      >
        {keys}
      </kbd>
      <span>{label}</span>
    </div>
  );
}
