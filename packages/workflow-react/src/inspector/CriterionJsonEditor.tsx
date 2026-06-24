import { useEffect, useRef } from "react";
import type { Criterion } from "@cyoda/workflow-core";
import {
  registerCriterionSchema,
  type WorkflowJsonModelLike,
  type WorkflowJsonEditorInstance,
} from "@cyoda/workflow-monaco";
import { useCriterionMonaco } from "./CriterionMonacoContext.js";
import { suppressMonacoDisposalRejections } from "../components/monacoDisposal.js";
import { parseCriterionJson, criterionModelUri, type CriterionJsonResult } from "./criterionJson.js";
import { colors, fonts, radii } from "../style/tokens.js";

export interface CriterionJsonEditorProps {
  value: Criterion;
  disabled: boolean;
  modelKey: string;
  onChange: (result: CriterionJsonResult) => void;
}

export function CriterionJsonEditor({ value, disabled, modelKey, onChange }: CriterionJsonEditorProps) {
  const monaco = useCriterionMonaco();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialText = useRef(JSON.stringify(value, null, 2)).current;

  if (monaco) {
    return (
      <MonacoCriterionEditor
        monaco={monaco}
        initialText={initialText}
        disabled={disabled}
        modelKey={modelKey}
        onChangeRef={onChangeRef}
      />
    );
  }
  return (
    <TextareaCriterionEditor
      initialText={initialText}
      disabled={disabled}
      onChangeRef={onChangeRef}
    />
  );
}

function TextareaCriterionEditor({
  initialText,
  disabled,
  onChangeRef,
}: {
  initialText: string;
  disabled: boolean;
  onChangeRef: React.MutableRefObject<(r: CriterionJsonResult) => void>;
}) {
  // Report initial validity once.
  useEffect(() => {
    onChangeRef.current(parseCriterionJson(initialText));
  }, [initialText, onChangeRef]);

  return (
    <textarea
      defaultValue={initialText}
      disabled={disabled}
      rows={16}
      data-testid="criterion-json-editor"
      style={jsonTextAreaStyle}
      onChange={(e) => onChangeRef.current(parseCriterionJson(e.target.value))}
    />
  );
}

function MonacoCriterionEditor({
  monaco,
  initialText,
  disabled,
  modelKey,
  onChangeRef,
}: {
  monaco: NonNullable<ReturnType<typeof useCriterionMonaco>>;
  initialText: string;
  disabled: boolean;
  modelKey: string;
  onChangeRef: React.MutableRefObject<(r: CriterionJsonResult) => void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<WorkflowJsonEditorInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;
    const model: WorkflowJsonModelLike = monaco.editor.createModel(
      initialText,
      "json",
      monaco.Uri.parse(criterionModelUri(modelKey)),
    );
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
    const schemaHandle = registerCriterionSchema(monaco);

    const report = () => onChangeRef.current(parseCriterionJson(model.getValue()));
    report(); // initial validity
    const sub = model.onDidChangeContent(report);

    return () => {
      suppressMonacoDisposalRejections();
      sub.dispose();
      schemaHandle.dispose();
      editor.dispose();
      editorRef.current = null;
      model.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, modelKey]);

  // Reflect disabled changes onto the live editor.
  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: disabled });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      data-testid="criterion-json-editor"
      style={{ height: 320, border: `1px solid ${colors.border}`, borderRadius: radii.sm }}
    />
  );
}

const jsonTextAreaStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 12,
  padding: 8,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: colors.border,
  borderRadius: radii.sm,
  background: "white",
  resize: "vertical",
};
