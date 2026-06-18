import { useRef, useState } from "react";
import type {
  DomainPatch,
  EdgeAnchor,
  EdgeAnchorPair,
  HostRef,
  Processor,
  Transition,
  TransitionSchedule,
  ValidationIssue,
  Workflow,
} from "@cyoda/workflow-core";
import { NAME_REGEX } from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { colors, radii } from "../style/tokens.js";
import { CheckboxField, CustomSelectInput, FieldGroup, SelectField, TextField } from "./fields.js";
import { CriterionSection } from "./CriterionForm.js";
import {
  ProcessorEditorModal,
  duplicateProcessorName,
  summarizeProcessor,
} from "./ProcessorForm.js";
import type { Selection } from "../state/types.js";

export function TransitionForm({
  workflow,
  stateCode,
  transition,
  transitionUuid,
  transitionIndex,
  processorUuids,
  anchors,
  disabled,
  issues,
  onDispatch,
  onSelectionChange,
}: {
  workflow: Workflow;
  stateCode: string;
  transition: Transition;
  transitionUuid: string;
  transitionIndex: number;
  processorUuids: string[];
  anchors: EdgeAnchorPair | undefined;
  disabled: boolean;
  issues?: ValidationIssue[];
  onDispatch: (patch: DomainPatch) => void;
  onSelectionChange?: (selection: Selection) => void;
}) {
  const messages = useMessages();
  const [renameError, setRenameError] = useState<string | null>(null);
  const [processorModal, setProcessorModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; processorUuid: string; processorIndex: number }
    | null
  >(null);

  const [scheduleDelayDraft, setScheduleDelayDraft] = useState<string>(
    transition.schedule?.delayMs !== undefined ? String(transition.schedule.delayMs) : "",
  );
  const [scheduleTimeoutDraft, setScheduleTimeoutDraft] = useState<string>(
    transition.schedule?.timeoutMs !== undefined ? String(transition.schedule.timeoutMs) : "",
  );
  const prevTransitionUuidRef = useRef(transitionUuid);
  if (prevTransitionUuidRef.current !== transitionUuid) {
    prevTransitionUuidRef.current = transitionUuid;
    setScheduleDelayDraft(
      transition.schedule?.delayMs !== undefined ? String(transition.schedule.delayMs) : "",
    );
    setScheduleTimeoutDraft(
      transition.schedule?.timeoutMs !== undefined ? String(transition.schedule.timeoutMs) : "",
    );
  }

  const update = (updates: Partial<Transition>) =>
    onDispatch({ op: "updateTransition", transitionUuid, updates });

  const removeTransition = () => onDispatch({ op: "removeTransition", transitionUuid });

  const handleRename = (next: string) => {
    if (next === transition.name) return;
    setRenameError(null);
    if (!NAME_REGEX.test(next)) {
      setRenameError(`"${next}" is not a valid transition name`);
      return;
    }
    const sibling = workflow.states[stateCode]?.transitions ?? [];
    if (sibling.some((t) => t.name === next)) {
      setRenameError(`Transition "${next}" already exists on this state`);
      return;
    }
    update({ name: next });
  };

  const setAnchor = (role: "source" | "target", next: EdgeAnchor | "") => {
    const current: EdgeAnchorPair = anchors ?? {};
    const updated: EdgeAnchorPair = { ...current };
    if (next === "") delete updated[role];
    else updated[role] = next;
    const isEmpty = updated.source === undefined && updated.target === undefined;
    onDispatch({ op: "setEdgeAnchors", transitionUuid, anchors: isEmpty ? null : updated });
  };

  const reorder = (direction: -1 | 1) => {
    const toIndex = transitionIndex + direction;
    if (toIndex < 0) return;
    onDispatch({
      op: "reorderTransition",
      workflow: workflow.name,
      fromState: stateCode,
      transitionUuid,
      toIndex,
    });
  };

  const commitScheduleDelay = (raw: string) => {
    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    const next: TransitionSchedule = { ...transition.schedule, delayMs: parsed };
    update({ schedule: next });
  };

  const commitScheduleTimeout = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      if (transition.schedule?.timeoutMs !== undefined) {
        const { timeoutMs: _removed, ...rest } = transition.schedule;
        update({ schedule: rest });
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    const next: TransitionSchedule = { ...transition.schedule, delayMs: transition.schedule?.delayMs ?? 1, timeoutMs: parsed };
    update({ schedule: next });
  };

  const allStateNames = Object.keys(workflow.states);
  const stateOptions = allStateNames.map((s) => ({ value: s, label: s }));

  const processorCount = transition.processors?.length ?? 0;
  const host: HostRef = {
    kind: "transition",
    workflow: workflow.name,
    state: stateCode,
    transitionUuid,
  };

  const processors = transition.processors ?? [];
  const existingProcessorNames = processors.map((processor) => processor.name);

  const applyProcessor = (processor: Processor) => {
    if (!processorModal) return;
    if (processorModal.mode === "add") {
      onDispatch({ op: "addProcessor", transitionUuid, processor });
    } else {
      onDispatch({
        op: "updateProcessor",
        processorUuid: processorModal.processorUuid,
        updates: processor,
      });
    }
    setProcessorModal(null);
  };

  const duplicateProcessor = (processor: Processor, index: number) => {
    const nextName = duplicateProcessorName(existingProcessorNames, processor.name);
    onDispatch({
      op: "addProcessor",
      transitionUuid,
      processor: { ...processor, name: nextName },
      index: index + 1,
    });
  };

  return (
    <div style={transitionFormStyle}>
      <FieldGroup title={messages.inspector.properties}>
        <TextField
          label={messages.inspector.name}
          value={transition.name}
          entityKey={transitionUuid}
          disabled={disabled}
          onCommit={handleRename}
          testId="inspector-transition-name"
        />
        {renameError && (
          <div role="alert" style={{ color: colors.danger, fontSize: 12 }}>
            {renameError}
          </div>
        )}

        {/* Move to different source state */}
        {!disabled && (
          <SelectField
            label="Source state"
            value={stateCode as (typeof allStateNames)[number]}
            options={stateOptions}
            disabled={disabled}
            onChange={(toState) => {
              if (toState === stateCode) return;
              onDispatch({
                op: "moveTransitionSource",
                workflow: workflow.name,
                fromState: stateCode,
                toState,
                transitionName: transition.name,
              });
            }}
            testId="inspector-transition-source-state"
          />
        )}

        {/* Target state — dropdown instead of free text */}
        <SelectField
          label="Target state"
          value={transition.next as (typeof allStateNames)[number]}
          options={stateOptions}
          disabled={disabled}
          onChange={(next) => update({ next })}
          testId="inspector-transition-next"
        />

        <SelectField
          label={messages.inspector.transitionType}
          value={transition.manual ? "manual" : "automated"}
          options={[
            { value: "automated", label: messages.inspector.automated },
            { value: "manual", label: messages.inspector.manual },
          ]}
          disabled={disabled}
          onChange={(next) => update({ manual: next === "manual" })}
          testId="inspector-transition-manual"
        />
        <CheckboxField
          label={messages.inspector.disabled}
          checked={transition.disabled}
          disabled={disabled}
          onChange={(next) => update({ disabled: next })}
          testId="inspector-transition-disabled"
        />

        <AnchorSelect
          label={messages.inspector.sourceAnchor}
          value={anchors?.source}
          disabled={disabled}
          messages={messages}
          onChange={(next) => setAnchor("source", next)}
          testId="inspector-transition-source-anchor"
        />
        <AnchorSelect
          label={messages.inspector.targetAnchor}
          value={anchors?.target}
          disabled={disabled}
          messages={messages}
          onChange={(next) => setAnchor("target", next)}
          testId="inspector-transition-target-anchor"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={disabled} onClick={() => reorder(-1)} style={ghostBtn}>
              {messages.inspector.moveUp}
            </button>
            <button type="button" disabled={disabled} onClick={() => reorder(1)} style={ghostBtn}>
              {messages.inspector.moveDown}
            </button>
          </div>
          <p
            style={{
              fontSize: 11,
              color: colors.textTertiary,
              margin: 0,
              lineHeight: 1.4,
            }}
            data-testid="transition-order-help"
          >
            {messages.inspector.transitionOrderHelp}
          </p>
        </div>

        <hr style={{ border: "none", borderTop: `1px solid ${colors.borderSubtle}`, margin: 0 }} />

        <button
          type="button"
          disabled={disabled}
          onClick={removeTransition}
          style={dangerBtn}
          data-testid="inspector-transition-delete"
        >
          Delete transition
        </button>

        <hr style={{ border: "none", borderTop: `1px solid ${colors.borderSubtle}`, margin: 0 }} />

        {/* Inline validation issues */}
        {issues && issues.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {issues.map((issue, i) => (
              <div
                key={`${issue.code}-${i}`}
                role="alert"
                style={{
                  padding: "4px 8px",
                  background: issue.severity === "error" ? colors.dangerBg : colors.warningBg,
                  border: `1px solid ${issue.severity === "error" ? colors.dangerBorder : colors.warningBorder}`,
                  borderRadius: radii.sm,
                  fontSize: 12,
                  color: issue.severity === "error" ? colors.danger : colors.warning,
                }}
              >
                {issue.message}
              </div>
            ))}
          </div>
        )}
      </FieldGroup>

      <TransitionSection
        title={messages.inspector.criteria}
        testId="inspector-transition-criteria-section"
      >
        <CriterionSection
          host={host}
          stateCode={stateCode}
          transitionName={transition.name}
          targetState={transition.next}
          manual={transition.manual}
          criterion={transition.criterion}
          disabled={disabled}
          onDispatch={onDispatch}
          onSelectionChange={onSelectionChange}
        />
      </TransitionSection>

      <TransitionSection
        title="Scheduled transition"
        testId="inspector-transition-schedule-section"
      >
        <label
          style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, fontSize: 12, color: colors.textSecondary, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={transition.schedule !== undefined}
            disabled={disabled}
            data-testid="inspector-transition-schedule-enabled"
            onChange={(e) => {
              if (e.target.checked) {
                setScheduleDelayDraft("1");
                setScheduleTimeoutDraft("");
                update({ schedule: { delayMs: 1 } });
              } else {
                setScheduleDelayDraft("");
                setScheduleTimeoutDraft("");
                update({ schedule: undefined });
              }
            }}
          />
          <span>Enable schedule</span>
        </label>

        {transition.schedule !== undefined && (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: colors.textSecondary }}>
              <span style={{ fontWeight: 500 }}>Delay (ms)</span>
              <input
                type="text"
                value={scheduleDelayDraft}
                disabled={disabled}
                data-testid="inspector-transition-schedule-delay"
                style={scheduleInputStyle}
                onChange={(e) => setScheduleDelayDraft(e.target.value)}
                onBlur={(e) => commitScheduleDelay(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: colors.textSecondary }}>
              <span style={{ fontWeight: 500 }}>Timeout (ms)</span>
              <input
                type="text"
                value={scheduleTimeoutDraft}
                disabled={disabled}
                data-testid="inspector-transition-schedule-timeout"
                style={scheduleInputStyle}
                onChange={(e) => setScheduleTimeoutDraft(e.target.value)}
                onBlur={(e) => commitScheduleTimeout(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </label>
          </>
        )}

        <p
          style={{
            margin: 0,
            padding: "6px 8px",
            fontSize: 12,
            color: colors.warning,
            background: colors.warningBg,
            border: `1px solid ${colors.warningBorder}`,
            borderRadius: radii.sm,
            lineHeight: 1.45,
          }}
          data-testid="inspector-transition-schedule-notice"
        >
          Scheduled transitions can be configured but are not yet executed by the workflow engine.
          Firing a scheduled transition currently returns 400 BAD_REQUEST.
        </p>
      </TransitionSection>

      <TransitionSection
        title={messages.inspector.processors}
        testId="inspector-transition-processes-section"
      >
        {processorCount === 0 ? (
          <div style={emptyProcessorStateStyle}>
            <p style={summaryTextStyle}>No processors run on this transition.</p>
          </div>
        ) : (
          <>
            <p style={processorHelperStyle}>Processors run sequentially in the order shown.</p>
            {processors.map((processor, index) => (
              <div key={processorUuids[index] ?? `${processor.name}-${index}`} style={processorRowStyle}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={processorOrderStyle}>{index + 1}.</span>
                  <span style={processorTypeChipStyle}>{processor.type}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>{processor.name}</strong>
                    <span style={summaryTextStyle}>{summarizeProcessor(processor)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      processorUuids[index] &&
                      setProcessorModal({
                        mode: "edit",
                        processorUuid: processorUuids[index]!,
                        processorIndex: index,
                      })
                    }
                    style={ghostBtn}
                    data-testid={`processor-edit-${index}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => duplicateProcessor(processor, index)}
                    style={ghostBtn}
                    data-testid={`processor-duplicate-${index}`}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === 0 || !processorUuids[index]}
                    onClick={() =>
                      processorUuids[index] &&
                      onDispatch({
                        op: "reorderProcessor",
                        transitionUuid,
                        processorUuid: processorUuids[index]!,
                        toIndex: index - 1,
                      })
                    }
                    style={ghostBtn}
                    data-testid={`processor-move-up-${index}`}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === processors.length - 1 || !processorUuids[index]}
                    onClick={() =>
                      processorUuids[index] &&
                      onDispatch({
                        op: "reorderProcessor",
                        transitionUuid,
                        processorUuid: processorUuids[index]!,
                        toIndex: index + 1,
                      })
                    }
                    style={ghostBtn}
                    data-testid={`processor-move-down-${index}`}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !processorUuids[index]}
                    onClick={() =>
                      processorUuids[index] &&
                      onDispatch({ op: "removeProcessor", processorUuid: processorUuids[index]! })
                    }
                    style={dangerBtn}
                    data-testid={`processor-delete-${index}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setProcessorModal({ mode: "add" })}
          style={ghostBtn}
          data-testid="inspector-add-processor"
        >
          {messages.inspector.addProcessor}
        </button>
      </TransitionSection>

      {processorModal && (
        <ProcessorEditorModal
          title={processorModal.mode === "add" ? "Add processor" : "Edit processor"}
          initialProcessor={
            processorModal.mode === "edit"
              ? processors[processorModal.processorIndex]
              : undefined
          }
          existingNames={
            processorModal.mode === "edit"
              ? existingProcessorNames.filter(
                  (_name, index) => index !== processorModal.processorIndex,
                )
              : existingProcessorNames
          }
          disabled={disabled}
          onCancel={() => setProcessorModal(null)}
          onApply={applyProcessor}
        />
      )}
    </div>
  );
}

function TransitionSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section style={transitionSectionStyle} data-testid={testId}>
      <header style={sectionHeaderStyle}>{title}</header>
      {children}
    </section>
  );
}

const transitionFormStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const transitionSectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
  paddingTop: 12,
  borderTop: `1px solid ${colors.borderSubtle}`,
};

const sectionHeaderStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: colors.textSecondary,
};

const ghostBtn = {
  padding: "4px 8px",
  background: "white",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 12,
  cursor: "pointer",
};

const dangerBtn = {
  ...ghostBtn,
  background: colors.dangerBg,
  borderColor: colors.dangerBorder,
  color: colors.danger,
};

const processorRowStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
  padding: 10,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  background: "white",
};

const processorTypeChipStyle = {
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: 999,
  background: colors.borderSubtle,
  color: colors.textSecondary,
  textTransform: "lowercase" as const,
};

const processorOrderStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: colors.textSecondary,
  minWidth: 18,
};

const summaryTextStyle = {
  margin: 0,
  fontSize: 12,
  color: colors.textSecondary,
  lineHeight: 1.45,
};

const processorHelperStyle = {
  margin: 0,
  fontSize: 12,
  color: colors.textTertiary,
};

const emptyProcessorStateStyle = {
  padding: 10,
  border: `1px dashed ${colors.border}`,
  borderRadius: radii.md,
  background: colors.surfaceMuted,
};

const scheduleInputStyle = {
  padding: "4px 8px",
  fontSize: 12,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  background: "white",
};

function AnchorSelect({
  label,
  value,
  disabled,
  messages,
  onChange,
  testId,
}: {
  label: string;
  value: EdgeAnchor | undefined;
  disabled: boolean;
  messages: ReturnType<typeof useMessages>;
  onChange: (next: EdgeAnchor | "") => void;
  testId: string;
}) {
  const options = [
    { value: "" as const, label: messages.inspector.anchorDefault },
    { value: "top-left" as const, label: messages.inspector.anchorTopLeft },
    { value: "top" as const, label: messages.inspector.anchorTop },
    { value: "top-right" as const, label: messages.inspector.anchorTopRight },
    { value: "right-top" as const, label: messages.inspector.anchorRightTop },
    { value: "right" as const, label: messages.inspector.anchorRight },
    { value: "right-bottom" as const, label: messages.inspector.anchorRightBottom },
    { value: "bottom-left" as const, label: messages.inspector.anchorBottomLeft },
    { value: "bottom" as const, label: messages.inspector.anchorBottom },
    { value: "bottom-right" as const, label: messages.inspector.anchorBottomRight },
    { value: "left-top" as const, label: messages.inspector.anchorLeftTop },
    { value: "left" as const, label: messages.inspector.anchorLeft },
    { value: "left-bottom" as const, label: messages.inspector.anchorLeftBottom },
  ] as const;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: colors.textSecondary }}>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <CustomSelectInput
        value={value ?? ""}
        options={options}
        onChange={onChange}
        disabled={disabled}
        testId={testId}
        small
      />
    </label>
  );
}
