import { useEffect, useRef, useState } from "react";
import type { Criterion } from "@cyoda/workflow-core";
import { registerCriterionSchema } from "@cyoda/workflow-monaco";
import { JsonMonacoField } from "./JsonMonacoField.js";
import { parseCriterionJson, criterionModelUri, criterionToJsonText, criterionWireShape } from "./criterionJson.js";
import { sameJson } from "./annotationsJson.js";
import { useMessages } from "../i18n/context.js";
import { colors, fonts, radii, primaryBtnStyle, ghostBtnStyle, destructiveBtnStyle, metaChipStyle } from "../style/tokens.js";

export function defaultSimpleCriterion(): Criterion {
  return { type: "simple", jsonPath: "", operation: "EQUALS" };
}

export interface CriterionFieldProps {
  value: Criterion | undefined;
  manual?: boolean;
  disabled: boolean;
  modelKey: string;
  emptyText?: string;
  onCommit: (next: Criterion) => void;
  onRemove: () => void;
}

const pretty = criterionToJsonText;

export function CriterionField(props: CriterionFieldProps) {
  const m = useMessages().criterion;
  if (props.value === undefined) {
    const emptyText = props.emptyText ?? (props.manual ? m.noneManual : m.noneAutomated);
    const showWarning = props.emptyText === undefined && !props.manual;
    return (
      <div style={cardStyle} data-testid="criterion-summary-card">
        <p style={summaryTextStyle}>{emptyText}</p>
        {showWarning && (
          <p style={warnStyle} data-testid="criterion-automated-warning">{m.noneAutomatedWarning}</p>
        )}
        {!props.disabled && (
          <button type="button" style={primaryBtnStyle} data-testid="inspector-criterion-add" onClick={() => props.onCommit(defaultSimpleCriterion())}>
            {m.add}
          </button>
        )}
      </div>
    );
  }
  return <CriterionEditor key={props.modelKey} {...props} value={props.value} />;
}

function CriterionEditor({ value, disabled, modelKey, onCommit, onRemove }: CriterionFieldProps & { value: Criterion }) {
  const messages = useMessages();
  const m = messages.criterion;
  const [expanded, setExpanded] = useState(false);
  const [buffer, setBuffer] = useState<string>(() => pretty(value));
  const [docChanged, setDocChanged] = useState(false);
  const prevValueRef = useRef<Criterion>(value);

  // Three-way sync on external value change — compare PARSED values, never buffer text.
  useEffect(() => {
    if (sameJson(prevValueRef.current, value)) return;
    const parsed = parseCriterionJson(buffer).criterion;
    if (parsed !== null && sameJson(parsed, value)) {
      setDocChanged(false);
    } else if (parsed !== null && sameJson(parsed, prevValueRef.current)) {
      setBuffer(pretty(value));
      setDocChanged(false);
    } else {
      setDocChanged(true);
    }
    prevValueRef.current = value;
  }, [value, buffer]);

  const result = parseCriterionJson(buffer);
  const dirty = result.criterion !== null && !sameJson(result.criterion, value);
  const applyEnabled = !disabled && result.criterion !== null && dirty;
  // Revert must stay enabled while the buffer is invalid JSON — that's exactly
  // when the user needs to bail out. Gate on a textual diff against the
  // committed value's pretty form instead of `dirty` (which is false for
  // unparseable buffers).
  const canRevert = buffer !== pretty(value);

  const apply = () => {
    if (!applyEnabled || result.criterion === null) return;
    onCommit(result.criterion);
    setDocChanged(false);
    setExpanded(false);
  };
  const revert = () => { setBuffer(pretty(value)); setDocChanged(false); };

  return (
    <div style={cardStyle} data-testid="criterion-summary-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={metaChipStyle}>{value.type}</span>
        <span style={{ flex: 1 }} />
        {!disabled && !expanded && (
          <button type="button" style={ghostBtnStyle} data-testid="inspector-criterion-edit" onClick={() => setExpanded(true)}>{m.edit}</button>
        )}
        {!disabled && (
          <button type="button" style={destructiveBtnStyle} data-testid="inspector-criterion-remove" onClick={onRemove}>{m.remove}</button>
        )}
      </div>

      {!expanded && <CompactJson criterion={value} />}

      {expanded && (
        <>
          <JsonMonacoField
            buffer={buffer}
            disabled={disabled}
            modelUri={criterionModelUri(modelKey)}
            onChange={setBuffer}
            seed={buffer}
            registerSchema={registerCriterionSchema}
            testId="criterion-json-editor"
          />
          {result.error && <div role="alert" data-testid="criterion-error" style={errorStyle}>{result.error}</div>}
          {docChanged && <div role="alert" data-testid="criterion-doc-changed" style={warnLineStyle}>{messages.inspector.annotationsDocChanged}</div>}
          {!disabled && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={apply} disabled={!applyEnabled} style={applyEnabled ? primaryBtnStyle : { ...primaryBtnStyle, opacity: 0.5, cursor: "not-allowed" }} data-testid="inspector-criterion-apply">{m.applyModal}</button>
              <button type="button" onClick={revert} disabled={!canRevert} style={ghostBtnStyle} data-testid="inspector-criterion-revert">{m.revert}</button>
              <button type="button" onClick={() => setExpanded(false)} style={ghostBtnStyle} data-testid="inspector-criterion-collapse">{m.collapse}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompactJson({ criterion }: { criterion: Criterion }) {
  const text = JSON.stringify(criterionWireShape(criterion));
  const display = text.length > 140 ? `${text.slice(0, 137)}…` : text;
  return (
    <code data-testid="criterion-compact-json" style={{ display: "block", fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, background: colors.surfaceMuted, padding: "6px 8px", borderRadius: radii.sm, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {display}
    </code>
  );
}

const cardStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, padding: 10, border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.surface };
const summaryTextStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: colors.textSecondary, lineHeight: 1.45 };
const warnStyle: React.CSSProperties = { margin: 0, padding: "6px 8px", background: colors.warningBg, border: `1px solid ${colors.warningBorder}`, borderRadius: radii.sm, color: colors.warning, fontSize: 11 };
const errorStyle: React.CSSProperties = { color: colors.danger, fontSize: 11 };
const warnLineStyle: React.CSSProperties = { color: colors.warning, fontSize: 11 };
