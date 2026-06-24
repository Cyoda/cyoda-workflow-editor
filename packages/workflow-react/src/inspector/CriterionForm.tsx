import { useState } from "react";
import type { Criterion, DomainPatch, HostRef } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { colors, fonts, radii } from "../style/tokens.js";
import { ModalFrame } from "../modals/DeleteStateModal.js";
import type { Selection } from "../state/types.js";
import { CriterionJsonEditor } from "./CriterionJsonEditor.js";
import { parseCriterionJson, type CriterionJsonResult } from "./criterionJson.js";

function defaultCriterion(type: "simple" | "group" | "function" | "lifecycle" | "array"): Criterion {
  switch (type) {
    case "simple":
      return { type: "simple", jsonPath: "", operation: "EQUALS" };
    case "group":
      return { type: "group", operator: "AND", conditions: [] };
    case "function":
      return { type: "function", function: { name: "" } };
    case "lifecycle":
      return { type: "lifecycle", field: "state", operation: "EQUALS" };
    case "array":
      return { type: "array", jsonPath: "", operation: "EQUALS", value: [] };
  }
}

export function CriterionSection({
  host,
  stateCode,
  transitionName,
  targetState,
  manual,
  criterion,
  disabled,
  onDispatch,
  onSelectionChange,
}: {
  host: HostRef;
  stateCode?: string;
  transitionName?: string;
  targetState?: string;
  manual?: boolean;
  criterion: Criterion | undefined;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
  onSelectionChange?: (selection: Selection) => void;
}) {
  const messages = useMessages();
  const [modalOpen, setModalOpen] = useState(false);
  const path = ["criterion"];

  const removeCriterion = () => {
    onDispatch({ op: "setCriterion", host, path, criterion: undefined });
    if (host.kind === "transition") {
      onSelectionChange?.({ kind: "transition", transitionUuid: host.transitionUuid });
    }
  };

  return (
    <>
      <CriterionSummaryCard
        criterion={criterion}
        disabled={disabled}
        manual={manual}
        onAdd={() => setModalOpen(true)}
        onEdit={() => setModalOpen(true)}
        onRemove={removeCriterion}
      />
      {modalOpen && (
        <CriterionEditorModal
          title={criterion ? messages.criterion.editTitle : messages.criterion.addTitle}
          context={`${stateCode ?? host.workflow} → ${transitionName ?? "transition"} → ${targetState ?? ""}`}
          host={host}
          path={path}
          initialCriterion={criterion}
          disabled={disabled}
          onDispatch={onDispatch}
          onCancel={() => setModalOpen(false)}
          onApplied={() => {
            setModalOpen(false);
            if (host.kind === "transition") {
              const selection: Selection = {
                kind: "transition",
                transitionUuid: host.transitionUuid,
              };
              onSelectionChange?.(selection);
              window.setTimeout(() => onSelectionChange?.(selection), 100);
            }
          }}
        />
      )}
    </>
  );
}

function CriterionSummaryCard({
  criterion,
  disabled,
  manual,
  onAdd,
  onEdit,
  onRemove,
}: {
  criterion: Criterion | undefined;
  disabled: boolean;
  manual?: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const messages = useMessages();
  const m = messages.criterion;

  if (!criterion) {
    return (
      <div style={cardStyle} data-testid="criterion-summary-card">
        <SectionHeader label={m.heading} badge="none" />
        <p style={summaryTextStyle}>
          {manual ? m.noneManual : m.noneAutomated}
        </p>
        {!manual && (
          <p style={warningCardStyle} data-testid="criterion-automated-warning">
            {m.noneAutomatedWarning}
          </p>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={onAdd}
            style={primaryBtn}
            data-testid="inspector-criterion-add"
          >
            {m.add}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle} data-testid="criterion-summary-card">
      <SectionHeader label={m.heading} badge={criterion.type} />
      <CriterionCompactJson criterion={criterion} />
      {!disabled && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            onClick={onEdit}
            style={ghostBtn}
            data-testid="inspector-criterion-edit"
          >
            {m.edit}
          </button>
          <button
            type="button"
            onClick={onRemove}
            style={dangerBtn}
            data-testid="inspector-criterion-remove"
          >
            {m.remove}
          </button>
        </div>
      )}
    </div>
  );
}

function CriterionCompactJson({ criterion }: { criterion: Criterion }) {
  const text = JSON.stringify(criterion);
  const display = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  return (
    <code
      data-testid="criterion-compact-json"
      style={{
        display: "block",
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.textSecondary,
        background: colors.surfaceMuted,
        padding: "6px 8px",
        borderRadius: radii.sm,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {display}
    </code>
  );
}

function criterionModelKey(host: HostRef): string {
  if (host.kind === "transition") return `transition-${host.transitionUuid}`;
  if (host.kind === "processorConfig") return `processor-${host.processorUuid}`;
  return `host-${host.workflow}`;
}

function CriterionEditorModal({
  title,
  context,
  host,
  path,
  initialCriterion,
  disabled,
  onDispatch,
  onCancel,
  onApplied,
}: {
  title: string;
  context: string;
  host: HostRef;
  path: string[];
  initialCriterion: Criterion | undefined;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
  onCancel: () => void;
  onApplied: () => void;
}) {
  const messages = useMessages();
  const seed = initialCriterion ?? defaultCriterion("simple");
  const [result, setResult] = useState<CriterionJsonResult>(() =>
    parseCriterionJson(JSON.stringify(seed)),
  );
  const modelKey = criterionModelKey(host);
  const applyDisabled = disabled || result.criterion === null;

  const apply = () => {
    if (applyDisabled || !result.criterion) return;
    onDispatch({ op: "setCriterion", host, path, criterion: result.criterion });
    onApplied();
  };

  return (
    <ModalFrame onCancel={onCancel} labelledBy="criterion-modal-title">
      <div style={modalStyle} data-testid="criterion-editor-modal">
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="criterion-modal-title" style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 12, color: colors.textTertiary }}>{context}</p>
        </header>

        <div style={modalBodyStyle}>
          <CriterionJsonEditor
            value={seed}
            disabled={disabled}
            modelKey={modelKey}
            onChange={setResult}
          />
        </div>

        {result.error && (
          <div role="alert" style={errorStyle} data-testid="criterion-modal-blocking-error">
            {result.error}
          </div>
        )}

        <footer style={modalFooterStyle}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onCancel} style={ghostBtn} data-testid="criterion-modal-cancel">
            {messages.criterion.cancel}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={applyDisabled}
            style={applyDisabled ? disabledPrimaryBtn : primaryBtn}
            data-testid="criterion-modal-apply"
          >
            {messages.criterion.applyModal}
          </button>
        </footer>
      </div>
    </ModalFrame>
  );
}

function SectionHeader({ label, badge }: { label: string; badge: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textSecondary }}>
        {label}
      </span>
      <span style={{ fontSize: 11, padding: "1px 6px", background: colors.surfaceMuted, borderRadius: radii.pill, color: colors.textTertiary }}>
        {badge}
      </span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  background: "white",
};
const summaryTextStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: colors.textSecondary, lineHeight: 1.45 };
const warningCardStyle: React.CSSProperties = {
  margin: 0,
  padding: "6px 8px",
  background: colors.warningBg,
  border: `1px solid ${colors.warningBorder}`,
  borderRadius: radii.sm,
  color: colors.warning,
  fontSize: 11,
};
const modalStyle: React.CSSProperties = {
  width: "min(760px, calc(100vw - 48px))",
  maxHeight: "min(760px, calc(100vh - 72px))",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const modalBodyStyle: React.CSSProperties = {
  overflow: "auto",
  padding: 12,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: radii.md,
  background: colors.surfaceMuted,
};
const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "sticky",
  bottom: 0,
  paddingTop: 10,
  borderTop: `1px solid ${colors.borderSubtle}`,
  background: "white",
};
const ghostBtn: React.CSSProperties = { padding: "6px 10px", background: "white", border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: colors.primary, color: "white", borderColor: colors.primary };
const disabledPrimaryBtn: React.CSSProperties = { ...primaryBtn, opacity: 0.5, cursor: "not-allowed" };
const dangerBtn: React.CSSProperties = { ...ghostBtn, background: colors.dangerBg, borderColor: colors.dangerBorder, color: colors.danger };
const errorStyle: React.CSSProperties = { color: colors.danger, fontSize: 11 };
