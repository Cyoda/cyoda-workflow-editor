import { useEffect, useMemo, useState } from "react";
import {
  NAME_REGEX,
  type DomainPatch,
  type ExecutionMode,
  type ExternalizedProcessor,
  type Processor,
  type Workflow,
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

const PROCESSOR_TYPES = [
  { value: "externalized", label: "Externalized" },
  { value: "scheduled", label: "Scheduled" },
] as const;

const DURATION_UNITS = [
  { value: "milliseconds", label: "Milliseconds", factor: 1 },
  { value: "seconds", label: "Seconds", factor: 1000 },
  { value: "minutes", label: "Minutes", factor: 60_000 },
  { value: "hours", label: "Hours", factor: 3_600_000 },
  { value: "days", label: "Days", factor: 86_400_000 },
] as const;

type ProcessorType = (typeof PROCESSOR_TYPES)[number]["value"];
type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

type DurationDraft = {
  amount: string;
  unit: DurationUnit;
};

type ProcessorDraft = {
  type: ProcessorType;
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
  delay: DurationDraft;
  transition: string;
  timeout: DurationDraft;
};

function factorFor(unit: DurationUnit): number {
  return DURATION_UNITS.find((entry) => entry.value === unit)?.factor ?? 1;
}

function durationToDraft(value: number | undefined): DurationDraft {
  if (value === undefined) return { amount: "", unit: "milliseconds" };
  for (let index = DURATION_UNITS.length - 1; index >= 0; index -= 1) {
    const option = DURATION_UNITS[index]!;
    if (value >= option.factor && value % option.factor === 0) {
      return { amount: String(value / option.factor), unit: option.value };
    }
  }
  return { amount: String(value), unit: "milliseconds" };
}

function parseDuration(
  draft: DurationDraft,
  opts: { required: boolean; label: string },
): { value?: number; error?: string } {
  const trimmed = draft.amount.trim();
  if (trimmed.length === 0) {
    return opts.required ? { error: `${opts.label} is required.` } : { value: undefined };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: `${opts.label} must be an integer greater than or equal to 0.` };
  }
  return { value: parsed * factorFor(draft.unit) };
}

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

function toDraft(processor?: Processor): ProcessorDraft {
  if (!processor || processor.type === "externalized") {
    const externalized = processor?.type === "externalized" ? processor : undefined;
    return {
      type: "externalized",
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
      delay: { amount: "", unit: "milliseconds" },
      transition: "",
      timeout: { amount: "", unit: "milliseconds" },
    };
  }
  return {
    type: "scheduled",
    name: processor.name,
    executionMode: "ASYNC_NEW_TX",
    startNewTxOnDispatch: false,
    attachEntity: false,
    calculationNodesTags: "",
    responseTimeoutMs: "",
    retryPolicy: "",
    context: "",
    asyncResult: false,
    crossoverToAsyncMs: "",
    delay: durationToDraft(processor.config.delayMs),
    transition: processor.config.transition,
    timeout: durationToDraft(processor.config.timeoutMs),
  };
}

function toProcessor(draft: ProcessorDraft): Processor {
  if (draft.type === "scheduled") {
    const delayMs = parseDuration(draft.delay, { required: true, label: "Delay" }).value ?? 0;
    const timeoutMs = parseDuration(draft.timeout, {
      required: false,
      label: "Timeout",
    }).value;
    return {
      type: "scheduled",
      name: draft.name.trim(),
      config: {
        delayMs,
        transition: draft.transition.trim(),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      },
    };
  }

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

  if (draft.type === "scheduled") {
    const delay = parseDuration(draft.delay, { required: true, label: "Delay" });
    if (delay.error) return delay.error;
    if (draft.transition.trim().length === 0) return "Scheduled transition is required.";
    const timeout = parseDuration(draft.timeout, { required: false, label: "Timeout" });
    if (timeout.error) return timeout.error;
    return null;
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
  if (processor.type === "scheduled") {
    const timeout =
      processor.config.timeoutMs !== undefined ? `, timeout ${processor.config.timeoutMs} ms` : "";
    return `After ${processor.config.delayMs} ms, trigger ${processor.config.transition}${timeout}.`;
  }

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
  workflow,
  initialProcessor,
  existingNames,
  disabled,
  onCancel,
  onApply,
}: {
  title: string;
  workflow?: Workflow;
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

  const transitionNames = useMemo(() => {
    if (!workflow) return [];
    const names: string[] = [];
    for (const state of Object.values(workflow.states)) {
      for (const transition of state.transitions) {
        if (!names.includes(transition.name)) names.push(transition.name);
      }
    }
    return names;
  }, [workflow]);

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
          <FormField label="Processor type">
            <CustomSelectInput
              value={draft.type}
              options={PROCESSOR_TYPES}
              onChange={(next) => setDraft((current) => ({ ...current, type: next as ProcessorType }))}
              testId="processor-type-select"
            />
          </FormField>

          <FormField label="Name">
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              data-testid="processor-name-input"
              style={inputStyle}
            />
          </FormField>

          {draft.type === "externalized" ? (
            <>
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
            </>
          ) : (
            <>
              <DurationField
                label="Delay"
                amountTestId="processor-scheduled-delay-amount"
                unitTestId="processor-scheduled-delay-unit"
                draft={draft.delay}
                onChange={(next) => setDraft((current) => ({ ...current, delay: next }))}
              />

              <FormField label="Transition to trigger">
                {transitionNames.length > 0 ? (
                  <CustomSelectInput
                    value={draft.transition}
                    options={[
                      { value: "", label: "Select transition" },
                      ...transitionNames.map((name) => ({ value: name, label: name })),
                    ]}
                    onChange={(next) => setDraft((current) => ({ ...current, transition: next }))}
                    testId="processor-scheduled-transition"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft.transition}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, transition: event.target.value }))
                    }
                    data-testid="processor-scheduled-transition"
                    style={inputStyle}
                  />
                )}
              </FormField>

              <DurationField
                label="Timeout"
                amountTestId="processor-scheduled-timeout-amount"
                unitTestId="processor-scheduled-timeout-unit"
                draft={draft.timeout}
                onChange={(next) => setDraft((current) => ({ ...current, timeout: next }))}
              />
            </>
          )}
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

function DurationField({
  label,
  draft,
  amountTestId,
  unitTestId,
  onChange,
}: {
  label: string;
  draft: DurationDraft;
  amountTestId: string;
  unitTestId: string;
  onChange: (draft: DurationDraft) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={draft.amount}
          onChange={(event) => onChange({ ...draft, amount: event.target.value })}
          data-testid={amountTestId}
          style={{ ...inputStyle, flex: 1 }}
        />
        <div style={{ width: 160 }}>
          <CustomSelectInput
            value={draft.unit}
            options={DURATION_UNITS.map((u) => ({ value: u.value, label: u.label }))}
            onChange={(next) => onChange({ ...draft, unit: next as DurationUnit })}
            testId={unitTestId}
          />
        </div>
      </div>
    </div>
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
  transitionUuid,
  workflow,
  disabled,
  onDispatch,
}: {
  processor: Processor;
  processorUuid: string;
  processorIndex: number;
  transitionUuid: string;
  workflow?: Workflow;
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
          workflow={workflow}
          initialProcessor={processor}
          existingNames={workflow ? collectProcessorNames(workflow, transitionUuid) : [processor.name]}
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

function collectProcessorNames(workflow: Workflow, transitionUuid: string): string[] {
  const names: string[] = [];
  for (const state of Object.values(workflow.states)) {
    for (const transition of state.transitions) {
      if (!transition.processors) continue;
      if (transitionUuid === "") continue;
      for (const processor of transition.processors) {
        if (!names.includes(processor.name)) names.push(processor.name);
      }
    }
  }
  return names;
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
