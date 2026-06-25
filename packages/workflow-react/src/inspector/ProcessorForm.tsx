import { useEffect, useState } from "react";
import {
  NAME_REGEX,
  type DomainPatch,
  type ExecutionMode,
  type ExternalizedProcessor,
  type Processor,
  type Transition,
} from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { colors, radii } from "../style/tokens.js";
import { CustomSelectInput } from "./fields.js";
import { ModalFrame } from "../modals/DeleteStateModal.js";

const EXECUTION_MODES: ExecutionMode[] = [
  "ASYNC_NEW_TX",
  "ASYNC_SAME_TX",
  "SYNC",
  "COMMIT_BEFORE_DISPATCH",
];

function parseOptionalInteger(value: string, label: string): { value?: number; error?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { value: undefined };
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: `${label} must be an integer greater than or equal to 0.` };
  }
  return { value: parsed };
}

function normalizeTags(value: string): string | undefined {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(",") : undefined;
}

type ProcessorDraft = {
  name: string;
  executionMode: ExecutionMode;
  startNewTxOnDispatch: boolean;
  attachEntity: boolean;
  calculationNodesTags: string;
  responseTimeoutMs: string;
  retryPolicy: string;
  context: string;
  asyncResult: boolean;
  crossoverToAsyncMs: string;
};

function toDraft(processor?: Processor): ProcessorDraft {
  const externalized = processor?.type === "externalized" ? processor : undefined;
  return {
    name: externalized?.name ?? "",
    executionMode: externalized?.executionMode ?? "ASYNC_NEW_TX",
    startNewTxOnDispatch: externalized?.startNewTxOnDispatch ?? false,
    attachEntity: externalized?.config?.attachEntity ?? false,
    calculationNodesTags: externalized?.config?.calculationNodesTags ?? "",
    responseTimeoutMs:
      externalized?.config?.responseTimeoutMs !== undefined
        ? String(externalized.config.responseTimeoutMs)
        : "",
    retryPolicy: externalized?.config?.retryPolicy ?? "",
    context: externalized?.config?.context ?? "",
    asyncResult: externalized?.config?.asyncResult ?? false,
    crossoverToAsyncMs:
      externalized?.config?.crossoverToAsyncMs !== undefined
        ? String(externalized.config.crossoverToAsyncMs)
        : "",
  };
}

function toProcessor(draft: ProcessorDraft): Processor {
  const responseTimeout = parseOptionalInteger(draft.responseTimeoutMs, "Response timeout");
  const crossover = parseOptionalInteger(draft.crossoverToAsyncMs, "Crossover to async");
  const config: NonNullable<ExternalizedProcessor["config"]> = {};
  if (draft.attachEntity) config.attachEntity = true;
  const tags = normalizeTags(draft.calculationNodesTags);
  if (tags !== undefined) config.calculationNodesTags = tags;
  if (responseTimeout.value !== undefined) config.responseTimeoutMs = responseTimeout.value;
  if (draft.retryPolicy.trim().length > 0) config.retryPolicy = draft.retryPolicy.trim();
  if (draft.context.trim().length > 0) config.context = draft.context;
  if (draft.asyncResult) config.asyncResult = true;
  if (draft.asyncResult && crossover.value !== undefined) {
    config.crossoverToAsyncMs = crossover.value;
  }

  return {
    type: "externalized",
    name: draft.name.trim(),
    executionMode: draft.executionMode,
    ...(draft.executionMode === "COMMIT_BEFORE_DISPATCH" && draft.startNewTxOnDispatch
      ? { startNewTxOnDispatch: true }
      : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

function validateDraft(
  draft: ProcessorDraft,
  existingNames: string[],
  originalName?: string,
): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return "Processor name is required.";
  if (!NAME_REGEX.test(name)) {
    return "Processor name must start with a letter and contain only letters, digits, underscores, or hyphens.";
  }
  if (existingNames.some((existing) => existing === name && existing !== originalName)) {
    return `Processor "${name}" already exists on this transition.`;
  }

  const responseTimeout = parseOptionalInteger(draft.responseTimeoutMs, "Response timeout");
  if (responseTimeout.error) return responseTimeout.error;
  if (draft.asyncResult) {
    const crossover = parseOptionalInteger(draft.crossoverToAsyncMs, "Crossover to async");
    if (crossover.error) return crossover.error;
  }
  return null;
}

export function summarizeProcessor(processor: Processor): string {
  const parts: string[] = [processor.executionMode ?? "ASYNC_NEW_TX"];
  if (processor.config?.calculationNodesTags) {
    parts.push(`tags ${processor.config.calculationNodesTags}`);
  }
  if (processor.config?.asyncResult) parts.push("async result");
  return parts.join(" · ");
}

export function duplicateProcessorName(existingNames: string[], originalName: string): string {
  const base = `${originalName}-copy`;
  if (!existingNames.includes(base)) return base;
  let index = 2;
  while (existingNames.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function ProcessorEditorModal({
  title,
  initialProcessor,
  existingNames,
  disabled,
  onCancel,
  onApply,
}: {
  title: string;
  initialProcessor?: Processor;
  existingNames: string[];
  disabled: boolean;
  onCancel: () => void;
  onApply: (processor: Processor) => void;
}) {
  const [draft, setDraft] = useState<ProcessorDraft>(() => toDraft(initialProcessor));

  useEffect(() => {
    setDraft(toDraft(initialProcessor));
  }, [initialProcessor]);

  const error = validateDraft(draft, existingNames, initialProcessor?.name);

  const apply = () => {
    if (disabled || error) return;
    onApply(toProcessor(draft));
  };

  return (
    <ModalFrame onCancel={onCancel} labelledBy="processor-modal-title">
      <div style={modalStyle} data-testid="processor-editor-modal">
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="processor-modal-title" style={{ margin: 0, fontSize: 18 }}>
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: colors.textTertiary }}>
            Processor changes stay local until Apply.
          </p>
        </header>

        <div style={modalBodyStyle}>
          <FormField label="Name">
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              data-testid="processor-name-input"
              style={inputStyle}
            />
          </FormField>

          <FormField label="Execution mode">
            <CustomSelectInput
              value={draft.executionMode}
              options={EXECUTION_MODES.map((mode) => ({ value: mode, label: mode }))}
              onChange={(next) => setDraft((current) => ({ ...current, executionMode: next as ExecutionMode }))}
              testId="processor-execution-mode"
            />
          </FormField>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={draft.attachEntity}
              onChange={(event) =>
                setDraft((current) => ({ ...current, attachEntity: event.target.checked }))
              }
            />
            <span>Attach entity</span>
          </label>

          <FormField label="Calculation node tags">
            <input
              type="text"
              value={draft.calculationNodesTags}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  calculationNodesTags: event.target.value,
                }))
              }
              data-testid="processor-tags-input"
              style={inputStyle}
            />
          </FormField>

          <FormField label="Response timeout ms">
            <input
              type="text"
              value={draft.responseTimeoutMs}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  responseTimeoutMs: event.target.value,
                }))
              }
              style={inputStyle}
            />
          </FormField>

          <FormField label="Retry policy">
            <input
              type="text"
              value={draft.retryPolicy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, retryPolicy: event.target.value }))
              }
              style={inputStyle}
            />
          </FormField>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={draft.asyncResult}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  asyncResult: event.target.checked,
                  crossoverToAsyncMs: event.target.checked ? current.crossoverToAsyncMs : "",
                }))
              }
              data-testid="processor-async-result"
            />
            <span>Async result</span>
          </label>

          <FormField label="Crossover to async ms">
            <input
              type="text"
              value={draft.crossoverToAsyncMs}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  crossoverToAsyncMs: event.target.value,
                }))
              }
              disabled={!draft.asyncResult}
              data-testid="processor-crossover-input"
              style={disabled ? disabledInputStyle : inputStyle}
            />
          </FormField>
        </div>

        {error && (
          <div role="alert" style={errorStyle} data-testid="processor-modal-error">
            {error}
          </div>
        )}

        <footer style={modalFooterStyle}>
          <button type="button" onClick={onCancel} style={ghostBtn} data-testid="processor-modal-cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={disabled || !!error}
            style={disabled || error ? disabledPrimaryBtn : primaryBtn}
            data-testid="processor-modal-apply"
          >
            Apply processor
          </button>
        </footer>
      </div>
    </ModalFrame>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export function ProcessorForm({
  processor,
  processorUuid,
  processorIndex,
  transition,
  transitionUuid,
  disabled,
  onDispatch,
}: {
  processor: Processor;
  processorUuid: string;
  processorIndex: number;
  transition: Transition;
  transitionUuid: string;
  disabled: boolean;
  onDispatch: (patch: DomainPatch) => void;
}) {
  const messages = useMessages();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div style={summaryCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ fontSize: 13 }}>{processor.name}</strong>
          <span style={{ fontSize: 12, color: colors.textSecondary }}>{summarizeProcessor(processor)}</span>
        </div>
        <span style={chipStyle}>{processor.type}</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setModalOpen(true)} style={ghostBtn}>
          Edit
        </button>
        <button
          type="button"
          disabled={disabled || processorIndex === 0}
          onClick={() =>
            onDispatch({
              op: "reorderProcessor",
              transitionUuid,
              processorUuid,
              toIndex: processorIndex - 1,
            })
          }
          style={ghostBtn}
        >
          {messages.inspector.moveUp}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onDispatch({
              op: "reorderProcessor",
              transitionUuid,
              processorUuid,
              toIndex: processorIndex + 1,
            })
          }
          style={ghostBtn}
        >
          {messages.inspector.moveDown}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDispatch({ op: "removeProcessor", processorUuid })}
          style={dangerBtn}
          data-testid="inspector-processor-delete"
        >
          {messages.inspector.removeProcessor}
        </button>
      </div>

      {modalOpen && (
        <ProcessorEditorModal
          title={`Edit ${processor.name}`}
          initialProcessor={processor}
          existingNames={(transition.processors ?? [])
            .filter((_p, index) => index !== processorIndex)
            .map((p) => p.name)}
          disabled={disabled}
          onCancel={() => setModalOpen(false)}
          onApply={(nextProcessor) => {
            onDispatch({
              op: "updateProcessor",
              processorUuid,
              updates: nextProcessor,
            });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: 12,
  color: colors.textSecondary,
  marginBottom: 2,
};

const inputStyle = {
  padding: "6px 8px",
  fontSize: 13,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  background: "white",
};

const disabledInputStyle = {
  ...inputStyle,
  background: colors.surfaceMuted,
  color: colors.textTertiary,
};

const modalStyle = {
  width: "min(760px, calc(100vw - 48px))",
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const modalBodyStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const modalFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const checkboxRowStyle = {
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: colors.textSecondary,
  cursor: "pointer",
};

const errorStyle = {
  padding: "8px 10px",
  border: `1px solid ${colors.dangerBorder}`,
  background: colors.dangerBg,
  borderRadius: radii.md,
  color: colors.danger,
  fontSize: 12,
};

const ghostBtn = {
  padding: "6px 10px",
  background: "white",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 12,
  cursor: "pointer",
};

const primaryBtn = {
  ...ghostBtn,
  background: colors.primary,
  color: "white",
  borderColor: colors.primary,
};

const disabledPrimaryBtn = {
  ...primaryBtn,
  opacity: 0.5,
  cursor: "not-allowed",
};

const dangerBtn = {
  ...ghostBtn,
  background: colors.dangerBg,
  borderColor: colors.dangerBorder,
  color: colors.danger,
};

const chipStyle = {
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: radii.pill,
  background: colors.borderSubtle,
  color: colors.textSecondary,
  textTransform: "lowercase" as const,
};

const summaryCardStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
  padding: 10,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  background: "white",
};
