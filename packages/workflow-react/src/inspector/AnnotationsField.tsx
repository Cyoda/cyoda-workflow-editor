import { useEffect, useRef, useState } from "react";
import type { Annotations } from "@cyoda/workflow-core";
import type { WorkflowJsonEditorInstance, WorkflowJsonModelLike } from "@cyoda/workflow-monaco";
import { useCriterionMonaco } from "./CriterionMonacoContext.js";
import { installMonacoCancellationFilter } from "../components/monacoDisposal.js";
import { annotationsModelUri, parseAnnotationsJson, sameJson } from "./annotationsJson.js";
import { colors, fonts, radii } from "../style/tokens.js";
import { useMessages } from "../i18n/context.js";

const pretty = (v: unknown): string => JSON.stringify(v, null, 2);

export interface AnnotationsFieldProps {
  value: Annotations | undefined;
  disabled: boolean;
  modelKey: string;
  onCommit: (next: Annotations) => void;
  onRemove: () => void;
  /**
   * Render the "Annotations" heading. Default `true`. Set `false` when an
   * enclosing container already provides the heading (e.g. the transition form,
   * which wraps the field in a titled `TransitionSection`) to avoid a duplicate.
   */
  showLabel?: boolean;
}

export function AnnotationsField(props: AnnotationsFieldProps) {
  const messages = useMessages();
  if (props.value === undefined) {
    return (
      <div style={sectionStyle}>
        {props.showLabel !== false && <SectionLabel />}
        {!props.disabled && (
          <button
            type="button"
            style={primaryBtn}
            data-testid="inspector-annotations-add"
            onClick={() => props.onCommit({})}
          >
            {messages.inspector.annotationsAdd}
          </button>
        )}
      </div>
    );
  }
  // Key on modelKey so switching nodes fully remounts the editor state.
  return <AnnotationsEditor key={props.modelKey} {...props} value={props.value} />;
}

function AnnotationsEditor({
  value,
  disabled,
  modelKey,
  onCommit,
  onRemove,
  showLabel,
}: AnnotationsFieldProps & { value: Annotations }) {
  const messages = useMessages();
  const monaco = useCriterionMonaco();
  const [buffer, setBuffer] = useState<string>(() => pretty(value));
  const [docChanged, setDocChanged] = useState(false);
  const prevValueRef = useRef<Annotations>(value);

  // Three-way sync when the document's `value` changes underneath.
  useEffect(() => {
    if (sameJson(prevValueRef.current, value)) return; // value prop identity changed but same content
    const parsed = parseAnnotationsJson(buffer).annotations;
    if (parsed !== null && sameJson(parsed, value)) {
      // In-sync / echo (e.g. our own Apply round-tripped): no-op.
      setDocChanged(false);
    } else if (parsed !== null && sameJson(parsed, prevValueRef.current)) {
      // External change, buffer clean → re-seed.
      setBuffer(pretty(value));
      setDocChanged(false);
    } else {
      // External change, buffer dirty (or invalid) → keep buffer, warn.
      setDocChanged(true);
    }
    prevValueRef.current = value;
  }, [value, buffer]);

  const result = parseAnnotationsJson(buffer);
  const dirty = result.annotations !== null && !sameJson(result.annotations, value);
  const applyEnabled = !disabled && result.annotations !== null && dirty;

  const apply = () => {
    if (!applyEnabled || result.annotations === null) return;
    onCommit(result.annotations);
    setDocChanged(false);
  };
  const revert = () => {
    setBuffer(pretty(value));
    setDocChanged(false);
  };

  return (
    <div style={sectionStyle}>
      {showLabel !== false && <SectionLabel />}
      {monaco ? (
        <MonacoJsonPane
          monaco={monaco}
          buffer={buffer}
          disabled={disabled}
          modelUri={annotationsModelUri(modelKey)}
          onChange={setBuffer}
        />
      ) : (
        <textarea
          value={buffer}
          disabled={disabled}
          rows={12}
          data-testid="annotations-json-editor"
          style={textareaStyle}
          onChange={(e) => setBuffer(e.target.value)}
        />
      )}
      {result.error && (
        <div role="alert" data-testid="annotations-error" style={errorStyle}>
          {result.error}
        </div>
      )}
      {docChanged && (
        <div role="alert" data-testid="annotations-doc-changed" style={warnStyle}>
          {messages.inspector.annotationsDocChanged}
        </div>
      )}
      {!disabled && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={apply}
            disabled={!applyEnabled}
            style={applyEnabled ? primaryBtn : disabledBtn}
            data-testid="inspector-annotations-apply"
          >
            {messages.inspector.annotationsApply}
          </button>
          <button type="button" onClick={revert} disabled={!dirty} style={ghostBtn} data-testid="inspector-annotations-revert">
            {messages.inspector.annotationsRevert}
          </button>
          <button type="button" onClick={onRemove} style={dangerBtn} data-testid="inspector-annotations-remove">
            {messages.inspector.annotationsRemove}
          </button>
        </div>
      )}
    </div>
  );
}

/** Controlled Monaco JSON pane: buffer state is the source of truth. */
function MonacoJsonPane({
  monaco,
  buffer,
  disabled,
  modelUri,
  onChange,
}: {
  monaco: NonNullable<ReturnType<typeof useCriterionMonaco>>;
  buffer: string;
  disabled: boolean;
  modelUri: string;
  onChange: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<WorkflowJsonEditorInstance | null>(null);
  const modelRef = useRef<WorkflowJsonModelLike | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;
    const model: WorkflowJsonModelLike = monaco.editor.createModel(buffer, "json", monaco.Uri.parse(modelUri));
    modelRef.current = model;
    const editor = monaco.editor.create(containerRef.current, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      tabSize: 2,
      scrollBeyondLastLine: false,
      theme: "vs",
      readOnly: disabled,
    });
    editorRef.current = editor;
    installMonacoCancellationFilter();
    const sub = model.onDidChangeContent(() => onChange(model.getValue()));
    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
      model.dispose();
      modelRef.current = null;
    };
    // eslint note: created once per modelUri; external buffer changes are pushed below.
  }, [monaco, modelUri]);

  // Push external buffer changes (re-seed/revert) into the model without echoing.
  useEffect(() => {
    const model = modelRef.current;
    if (model && model.getValue() !== buffer) model.setValue(buffer);
  }, [buffer]);

  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: disabled });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      data-testid="annotations-json-editor"
      style={{ height: 220, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}
    />
  );
}

function SectionLabel() {
  const messages = useMessages();
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textSecondary }}>
      {messages.inspector.annotations}
    </span>
  );
}

const sectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const textareaStyle: React.CSSProperties = {
  fontFamily: fonts.mono, fontSize: 12, padding: 8, minHeight: 180,
  border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: "white", resize: "vertical",
};
const ghostBtn: React.CSSProperties = { padding: "6px 10px", background: "white", border: `1px solid ${colors.border}`, borderRadius: radii.sm, fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: colors.primary, color: "white", borderColor: colors.primary };
const disabledBtn: React.CSSProperties = { ...primaryBtn, opacity: 0.5, cursor: "not-allowed" };
const dangerBtn: React.CSSProperties = { ...ghostBtn, background: colors.dangerBg, borderColor: colors.dangerBorder, color: colors.danger };
const errorStyle: React.CSSProperties = { color: colors.danger, fontSize: 11 };
const warnStyle: React.CSSProperties = { color: colors.warning, fontSize: 11 };
