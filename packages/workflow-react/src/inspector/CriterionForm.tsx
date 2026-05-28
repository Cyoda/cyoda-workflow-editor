import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type {
  ArrayCriterion,
  Criterion,
  DomainPatch,
  FieldHint,
  FunctionCriterion,
  GroupCriterion,
  HostRef,
  JsonPathRejectReason,
  LifecycleCriterion,
  OperatorType,
  SimpleCriterion,
} from "@cyoda/workflow-core";
import {
  CRITERION_DEPTH_WARNING_THRESHOLD,
  NAME_REGEX,
  OPERATOR_GROUPS,
  OPERATOR_VALUE_SHAPE,
  SUPPORTED_SIMPLE_OPERATORS,
  UNSUPPORTED_OPERATORS,
  validateJsonPathSubset,
} from "@cyoda/workflow-core";
import { useMessages } from "../i18n/context.js";
import { CustomSelectInput } from "./fields.js";
import { ModalFrame } from "../modals/DeleteStateModal.js";
import type { Selection } from "../state/types.js";
import { useFieldHints } from "./criteria/FieldHintsContext.js";
import { JsonPathInput } from "./criteria/JsonPathInput.js";

const LIFECYCLE_FIELDS = ["state", "creationDate", "previousTransition"] as const;
const CRITERION_TYPES = ["simple", "group", "function", "lifecycle", "array"] as const;
type CriterionType = (typeof CRITERION_TYPES)[number];

function cloneCriterion(c: Criterion): Criterion {
  return typeof structuredClone === "function"
    ? structuredClone(c)
    : (JSON.parse(JSON.stringify(c)) as Criterion);
}

function defaultCriterion(type: CriterionType): Criterion {
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
      <CriterionSummary criterion={criterion} />
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
  const [draft, setDraft] = useState<Criterion>(() =>
    initialCriterion ? cloneCriterion(initialCriterion) : defaultCriterion("simple"),
  );
  const [useJson, setUseJson] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(draft, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, boolean>>({});

  const reportLocalError = useCallback((key: string, hasError: boolean) => {
    setLocalErrors((current) => {
      if (current[key] === hasError) return current;
      return { ...current, [key]: hasError };
    });
  }, []);

  const blockingError = criterionBlockingError(draft);
  const hasLocalError = Object.values(localErrors).some(Boolean);
  const applyDisabled = disabled || !!jsonError || !!blockingError || hasLocalError;

  const updateJsonDraft = (value: string) => {
    setJsonDraft(value);
    try {
      const parsed = JSON.parse(value) as Criterion;
      if (!CRITERION_TYPES.includes(parsed.type as CriterionType)) {
        setJsonError(`Unknown criterion type "${parsed.type}"`);
        return;
      }
      setJsonError(null);
      setDraft(parsed);
    } catch {
      setJsonError(messages.criterion.invalidJson);
    }
  };

  const apply = () => {
    if (applyDisabled) return;
    onDispatch({ op: "setCriterion", host, path, criterion: draft });
    onApplied();
  };

  return (
    <ModalFrame onCancel={onCancel} labelledBy="criterion-modal-title">
      <div
        style={modalStyle}
        data-testid="criterion-editor-modal"
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id="criterion-modal-title" style={{ margin: 0, fontSize: 18 }}>
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>{context}</p>
        </header>

        <div style={modalBodyStyle}>
          {useJson ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                value={jsonDraft}
                onChange={(e) => updateJsonDraft(e.target.value)}
                rows={14}
                disabled={disabled}
                data-testid="criterion-json-editor"
                style={jsonTextAreaStyle}
              />
              {jsonError && (
                <div role="alert" style={errorStyle} data-testid="criterion-json-error">
                  {jsonError}
                </div>
              )}
            </div>
          ) : (
            <CriterionEditorBody
              criterion={draft}
              disabled={disabled}
              depth={0}
              pathKey="criterion"
              onChange={setDraft}
              reportLocalError={reportLocalError}
            />
          )}
        </div>

        {blockingError && (
          <div role="alert" style={errorStyle} data-testid="criterion-modal-blocking-error">
            {blockingError}
          </div>
        )}

        <footer style={modalFooterStyle}>
          {useJson ? (
            <button
              type="button"
              onClick={() => {
                setUseJson(false);
                setJsonError(null);
              }}
              style={ghostBtn}
              data-testid="criterion-back-to-form"
            >
              {messages.criterion.backToForm}
            </button>
          ) : (
            <div style={advancedStyle}>
              <button
                type="button"
                onClick={() => setAdvancedOpen((current) => !current)}
                style={advancedSummaryStyle}
                data-testid="criterion-advanced-toggle"
              >
                {advancedOpen ? "▾" : "▸"} {messages.criterion.advanced}
              </button>
              {advancedOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setJsonDraft(JSON.stringify(draft, null, 2));
                    setJsonError(null);
                    setUseJson(true);
                  }}
                  style={{ ...ghostBtn, marginTop: 6 }}
                  data-testid="criterion-edit-json"
                >
                  {messages.criterion.editJson}
                </button>
              )}
            </div>
          )}
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

function CriterionEditorBody({
  criterion,
  disabled,
  depth,
  pathKey,
  onChange,
  reportLocalError,
}: {
  criterion: Criterion;
  disabled: boolean;
  depth: number;
  pathKey: string;
  onChange: (criterion: Criterion) => void;
  reportLocalError: (key: string, hasError: boolean) => void;
}) {
  const [activeKey, setActiveKey] = useState(() =>
    criterion.type === "group" ? "" : pathKey,
  );

  useEffect(() => {
    if (criterion.type !== "group" || activeKey !== pathKey) return;
    const lastIndex = criterion.conditions.length - 1;
    setActiveKey(lastIndex >= 0 ? `${pathKey}.conditions.${lastIndex}` : "");
  }, [activeKey, criterion, pathKey]);

  return (
    <CriterionBuilder
      criterion={criterion}
      disabled={disabled}
      depth={depth}
      pathKey={pathKey}
      activeKey={activeKey}
      onActiveKeyChange={setActiveKey}
      onChange={onChange}
      reportLocalError={reportLocalError}
    />
  );
}

function CriterionBuilder({
  criterion,
  disabled,
  depth,
  pathKey,
  activeKey,
  onActiveKeyChange,
  onChange,
  reportLocalError,
}: {
  criterion: Criterion;
  disabled: boolean;
  depth: number;
  pathKey: string;
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  onChange: (criterion: Criterion) => void;
  reportLocalError: (key: string, hasError: boolean) => void;
}) {
  return (
    <div style={builderStyle} data-testid="criterion-builder">
      <PlainEnglishPreview criterion={criterion} />
      {criterion.type === "group" ? (
        <RuleGroupBlock
          criterion={criterion}
          disabled={disabled}
          depth={depth}
          pathKey={pathKey}
          activeKey={activeKey}
          onActiveKeyChange={onActiveKeyChange}
          onChange={onChange}
          reportLocalError={reportLocalError}
        />
      ) : (
        <RuleEditorPanel
          criterion={criterion}
          disabled={disabled}
          depth={depth}
          pathKey={pathKey}
          onChange={onChange}
          reportLocalError={reportLocalError}
          allowWrap={depth === 0}
          autoFocus={false}
          onDone={undefined}
        />
      )}
    </div>
  );
}

function PlainEnglishPreview({ criterion }: { criterion: Criterion }) {
  const messages = useMessages();
  return (
    <div style={previewStyle} data-testid="criterion-plain-summary">
      <span style={previewLabelStyle}>{messages.criterion.preview}</span>
      <span>{summarizeCriterionReadable(criterion)}</span>
    </div>
  );
}

function RuleEditorPanel({
  criterion,
  disabled,
  depth,
  pathKey,
  onChange,
  reportLocalError,
  allowWrap,
  autoFocus = false,
  onDone,
}: {
  criterion: Criterion;
  disabled: boolean;
  depth: number;
  pathKey: string;
  onChange: (criterion: Criterion) => void;
  reportLocalError: (key: string, hasError: boolean) => void;
  allowWrap: boolean;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const messages = useMessages();
  const [changingType, setChangingType] = useState(false);

  const setType = (type: CriterionType) => onChange(defaultCriterion(type));

  const wrapInAndGroup = () => {
    if (criterion.type === "group") return;
    onChange({
      type: "group",
      operator: "AND",
      conditions: [
        cloneCriterion(criterion),
        { type: "simple", jsonPath: "", operation: "EQUALS" },
      ],
    });
  };

  return (
    <div style={{ ...ruleEditorStyle, marginLeft: depth > 0 ? 16 : 0 }} data-testid={`criterion-rule-editor-${pathKey}`}>
      <div style={ruleEditorHeaderStyle}>
        <span style={criterionTypeBadgeStyle}>{criterion.type}</span>
        <strong style={{ fontSize: 13 }}>{summarizeCriterionReadable(criterion)}</strong>
        {!disabled && (
          <button
            type="button"
            onClick={() => setChangingType((current) => !current)}
            style={compactGhostBtn}
            data-testid={`criterion-change-type-${pathKey}`}
          >
            {messages.criterion.changeType}
          </button>
        )}
      </div>

      {changingType && (
        <AddConditionMenu
          onSelect={(type) => {
            setType(type);
            setChangingType(false);
          }}
        />
      )}

      {criterion.type === "simple" && (
        <SimpleCriterionFields
          criterion={criterion}
          disabled={disabled}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
      {criterion.type === "group" && (
        <RuleGroupBlock
          criterion={criterion}
          disabled={disabled}
          depth={depth}
          pathKey={pathKey}
          activeKey=""
          onActiveKeyChange={() => undefined}
          onChange={onChange}
          reportLocalError={reportLocalError}
        />
      )}
      {criterion.type === "function" && (
        <FunctionCriterionFields
          criterion={criterion}
          disabled={disabled}
          depth={depth}
          pathKey={pathKey}
          onChange={onChange}
          reportLocalError={reportLocalError}
        />
      )}
      {criterion.type === "lifecycle" && (
        <LifecycleCriterionFields criterion={criterion} disabled={disabled} onChange={onChange} />
      )}
      {criterion.type === "array" && (
        <ArrayCriterionFields criterion={criterion} disabled={disabled} onChange={onChange} />
      )}

      {criterion.type !== "group" && allowWrap && !disabled && (
        <button
          type="button"
          onClick={wrapInAndGroup}
          style={ghostBtn}
          data-testid="criterion-wrap-and"
        >
          {messages.criterion.wrapInGroup}
        </button>
      )}

      {onDone && (
        <div style={ruleEditorActionsStyle}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDone();
            }}
            style={ghostBtn}
            data-testid={`criterion-rule-done-${pathKey}`}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function SimpleCriterionFields({
  criterion,
  disabled,
  onChange,
  autoFocus,
}: {
  criterion: SimpleCriterion;
  disabled: boolean;
  onChange: (c: Criterion) => void;
  autoFocus?: boolean;
}) {
  const messages = useMessages();
  const { hints } = useFieldHints();
  const m = messages.criterion;
  const shape = OPERATOR_VALUE_SHAPE[criterion.operation];
  const valueEditorKind = getValueEditorKind(criterion.jsonPath, hints);
  const isDateLikeValue = valueEditorKind !== "text";
  const pathError = jsonPathError(criterion.jsonPath, m);
  const range = Array.isArray(criterion.value) ? criterion.value : [];
  const low = formatScalar(range[0]);
  const high = formatScalar(range[1]);
  const scalarValue =
    criterion.value === undefined || Array.isArray(criterion.value)
      ? ""
      : formatScalar(criterion.value);
  const betweenError = shape === "range" && (low.trim() === "" || high.trim() === "")
    ? m.betweenShape
    : null;
  const likeValueWarning =
    criterion.operation === "LIKE" && /[%_]/.test(scalarValue) ? m.likeWildcardHelp : null;
  const matchesValueWarning =
    criterion.operation === "MATCHES_PATTERN" &&
    scalarValue.length > 0 &&
    !scalarValue.startsWith("^") &&
    !scalarValue.endsWith("$")
      ? m.matchesPatternHelp
      : null;
  const updateOperation = (operation: OperatorType) => {
    const next: SimpleCriterion = { type: "simple", jsonPath: criterion.jsonPath, operation };
    if (OPERATOR_VALUE_SHAPE[operation] === "range") next.value = ["", ""];
    onChange(next);
  };

  return (
    <>
      <label style={labelStyle}>
        <span>{m.jsonPath}</span>
        <JsonPathInput
          value={criterion.jsonPath}
          onChange={(jsonPath) => onChange({ ...criterion, jsonPath })}
          disabled={disabled}
          hasError={!!pathError}
          autoFocus={autoFocus}
          inputStyle={inputStyle}
          testIdPrefix="criterion-simple"
        />
        {pathError && (
          <span role="alert" style={errorStyle} data-testid="criterion-simple-path-error">
            {pathError}
          </span>
        )}
      </label>

      <label style={labelStyle}>
        <span>{m.operation}</span>
        <CustomSelectInput
          value={criterion.operation}
          groups={buildOperatorGroups()}
          disabledOption={
            UNSUPPORTED_OPERATORS.has(criterion.operation)
              ? { value: criterion.operation, label: `${criterion.operation} ${m.legacySuffix}` }
              : undefined
          }
          disabled={disabled}
          onChange={(next) => updateOperation(next as OperatorType)}
          testId="criterion-simple-op"
        />
        {criterion.operation === "LIKE" && (
          <span style={hintStyle} data-testid="criterion-simple-like-help">{m.likeHelp}</span>
        )}
        {criterion.operation === "MATCHES_PATTERN" && (
          <span style={hintStyle} data-testid="criterion-simple-matches-help">
            {m.matchesPatternHelpAlways}
          </span>
        )}
      </label>

      {shape === "scalar" && (
        <label style={labelStyle}>
          <span>{m.value}</span>
          {isDateLikeValue ? (
            <>
              <input
                type={valueEditorKind}
                value={scalarValue}
                disabled={disabled}
                onChange={(e) => {
                  const raw = e.target.value;
                  const { value: _value, ...base } = criterion;
                  onChange(raw.trim() === "" ? base : { ...criterion, value: raw as never });
                }}
                style={inputStyle}
                data-testid="criterion-simple-value"
              />
              <span style={hintStyle} data-testid="criterion-simple-date-format">
                {dateFormatHint(valueEditorKind)}. Stored as a string value. Use the format expected by your entity data.
              </span>
            </>
          ) : (
            <ValueEditor
              value={criterion.value}
              disabled={disabled}
              testId="criterion-simple-value"
              onChange={(raw) => {
                const { value: _value, ...base } = criterion;
                onChange(raw === undefined ? base : { ...criterion, value: raw as never });
              }}
            />
          )}
          {likeValueWarning && (
            <span style={warningStyle} data-testid="criterion-simple-like-warning">
              {likeValueWarning}
            </span>
          )}
          {matchesValueWarning && (
            <span style={warningStyle} data-testid="criterion-simple-matches-warning">
              {matchesValueWarning}
            </span>
          )}
        </label>
      )}

      {shape === "range" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span data-testid="criterion-simple-range-start-label">
                {isDateLikeValue ? "From" : m.low}
              </span>
              <input
                type={isDateLikeValue ? valueEditorKind : "text"}
                value={low}
                disabled={disabled}
                onChange={(e) => {
                  const value = isDateLikeValue ? e.target.value : parseScalar(e.target.value);
                  onChange({ ...criterion, value: [value, range[1] ?? ""] as never });
                }}
                style={betweenError ? { ...inputStyle, borderColor: "#FCA5A5" } : inputStyle}
                data-testid="criterion-simple-low"
              />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span data-testid="criterion-simple-range-end-label">
                {isDateLikeValue ? "To" : m.high}
              </span>
              <input
                type={isDateLikeValue ? valueEditorKind : "text"}
                value={high}
                disabled={disabled}
                onChange={(e) => {
                  const value = isDateLikeValue ? e.target.value : parseScalar(e.target.value);
                  onChange({ ...criterion, value: [range[0] ?? "", value] as never });
                }}
                style={betweenError ? { ...inputStyle, borderColor: "#FCA5A5" } : inputStyle}
                data-testid="criterion-simple-high"
              />
            </label>
          </div>
          {isDateLikeValue && (
            <span style={hintStyle} data-testid="criterion-simple-date-format">
              {dateFormatHint(valueEditorKind)}. Stored as a string value. Use the format expected by your entity data.
            </span>
          )}
          {betweenError && (
            <span role="alert" style={errorStyle} data-testid="criterion-simple-between-error">
              {betweenError}
            </span>
          )}
        </div>
      )}

      {shape === "none" && (
        <span style={hintStyle} data-testid="criterion-simple-value-ignored">
          {m.valueIgnored}
        </span>
      )}
    </>
  );
}

function RuleGroupBlock({
  criterion,
  disabled,
  depth,
  pathKey,
  activeKey,
  onActiveKeyChange,
  onChange,
  reportLocalError,
  onDone,
}: {
  criterion: GroupCriterion;
  disabled: boolean;
  depth: number;
  pathKey: string;
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  onChange: (c: Criterion) => void;
  reportLocalError: (key: string, hasError: boolean) => void;
  onDone?: () => void;
}) {
  const messages = useMessages();
  const m = messages.criterion;
  const g = messages.criterion.group;
  const isLegacyOperator = criterion.operator !== "AND" && criterion.operator !== "OR";
  const showDepthWarning = depth >= CRITERION_DEPTH_WARNING_THRESHOLD;
  const [showAddMenu, setShowAddMenu] = useState(false);

  const updateCondition = (idx: number, next: Criterion) => {
    const conditions = [...criterion.conditions];
    conditions[idx] = next;
    onChange({ ...criterion, conditions });
  };

  const addCriterion = (nextCriterion: Criterion) => {
    const index = criterion.conditions.length;
    onChange({
      ...criterion,
      conditions: [...criterion.conditions, nextCriterion],
    });
    onActiveKeyChange(`${pathKey}.conditions.${index}`);
    setShowAddMenu(false);
  };

  return (
    <div
      style={{
        ...groupBlockStyle,
        ...(depth > 0 ? nestedGroupBlockStyle : {}),
        marginLeft: depth > 0 ? 16 : 0,
      }}
      data-testid={depth > 0 ? `criterion-group-nested-${pathKey}` : "criterion-group-block"}
    >
      {showDepthWarning && (
        <div role="status" style={depthWarningStyle} data-testid="criterion-group-depth-warning">
          {g.depthWarning}
        </div>
      )}
      <div style={groupHeaderStyle}>
        <div>
          <h3 style={subheadingStyle}>{g.heading}</h3>
          <p style={{ ...summaryTextStyle, marginTop: 2 }}>
            {summarizeCriterionReadable(criterion)}
          </p>
        </div>
        <span style={criterionTypeBadgeStyle}>{criterion.type}</span>
      </div>

      <div style={matchControlStyle} role="group" aria-label={g.operator}>
        <span style={matchLabelStyle}>{g.operator}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...criterion, operator: "AND" })}
          style={criterion.operator === "AND" ? segmentedActiveStyle : segmentedStyle}
          data-testid="criterion-group-and"
        >
          {g.allConditions}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...criterion, operator: "OR" })}
          style={criterion.operator === "OR" ? segmentedActiveStyle : segmentedStyle}
          data-testid="criterion-group-or"
        >
          {g.anyCondition}
        </button>
      </div>
      {isLegacyOperator && (
        <div role="status" style={warningStyle} data-testid="criterion-group-legacy-operator">
          {m.legacyNotBanner}
        </div>
      )}

      <div style={ruleListStyle}>
        {criterion.conditions.length === 0 && (
          <div
            style={emptyGroupStyle}
            data-testid={`criterion-group-empty-${pathKey}`}
          >
            {g.empty}
          </div>
        )}
        {criterion.conditions.map((cond, idx) => (
          <Fragment key={idx}>
            {idx > 0 && (
              <div style={connectorRowStyle} aria-hidden="true">
                <span
                  style={connectorChipStyle}
                  data-testid={`criterion-group-connector-${idx - 1}`}
                >
                  {criterion.operator === "OR" ? "OR" : "AND"}
                </span>
              </div>
            )}
            <RuleRow
            criterion={cond}
            disabled={disabled}
            index={idx}
            canMoveDown={idx < criterion.conditions.length - 1}
            active={isActivePath(activeKey, `${pathKey}.conditions.${idx}`)}
            onEdit={() => onActiveKeyChange(`${pathKey}.conditions.${idx}`)}
            onMoveUp={() => {
              if (idx === 0) return;
              const next = [...criterion.conditions];
              [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
              onChange({ ...criterion, conditions: next });
              onActiveKeyChange(`${pathKey}.conditions.${idx - 1}`);
            }}
            onMoveDown={() => {
              if (idx >= criterion.conditions.length - 1) return;
              const next = [...criterion.conditions];
              [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
              onChange({ ...criterion, conditions: next });
              onActiveKeyChange(`${pathKey}.conditions.${idx + 1}`);
            }}
            onDuplicate={() => {
              const next = [...criterion.conditions];
              next.splice(idx + 1, 0, cloneCriterion(cond));
              onChange({ ...criterion, conditions: next });
              onActiveKeyChange(`${pathKey}.conditions.${idx + 1}`);
            }}
            onRemove={() => {
              onChange({ ...criterion, conditions: criterion.conditions.filter((_, i) => i !== idx) });
              onActiveKeyChange("");
            }}
          >
            {isActivePath(activeKey, `${pathKey}.conditions.${idx}`) && (
              <div
                style={nestedEditorStyle}
                data-testid={`criterion-group-editor-${idx}`}
                onClick={(event) => event.stopPropagation()}
              >
                {cond.type === "group" ? (
                  <RuleGroupBlock
                    criterion={cond}
                    disabled={disabled}
                    depth={depth + 1}
                    pathKey={`${pathKey}.conditions.${idx}`}
                    activeKey={activeKey}
                    onActiveKeyChange={onActiveKeyChange}
                    onChange={(next) => updateCondition(idx, next)}
                    reportLocalError={reportLocalError}
                    onDone={() => onActiveKeyChange("")}
                  />
                ) : (
                  <RuleEditorPanel
                    criterion={cond}
                    disabled={disabled}
                    depth={depth + 1}
                    pathKey={`${pathKey}.conditions.${idx}`}
                    onChange={(next) => updateCondition(idx, next)}
                    reportLocalError={reportLocalError}
                    allowWrap={false}
                    autoFocus={cond.type === "simple" && cond.jsonPath === ""}
                    onDone={() => onActiveKeyChange("")}
                  />
                )}
              </div>
            )}
            </RuleRow>
          </Fragment>
        ))}
      </div>
      {onDone && (
        <div style={ruleEditorActionsStyle}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDone();
            }}
            style={ghostBtn}
            data-testid={`criterion-rule-done-${pathKey}`}
          >
            Done
          </button>
        </div>
      )}
      {!disabled && (
        <div style={groupActionsStyle}>
          <div>
            <button
              type="button"
              onClick={() => addCriterion(defaultCriterion("simple"))}
              style={ghostBtn}
              data-testid="criterion-group-add-condition"
            >
              {g.addCondition}
            </button>
            {showAddMenu && (
              <AddConditionMenu
                onSelect={(type) => addCriterion(defaultCriterion(type))}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => addCriterion(defaultCriterion("group"))}
            style={ghostBtn}
            data-testid="criterion-group-add-group"
          >
            {g.addGroup}
          </button>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  criterion,
  disabled,
  index,
  canMoveDown,
  active,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  children,
}: {
  criterion: Criterion;
  disabled: boolean;
  index: number;
  canMoveDown: boolean;
  active: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const g = useMessages().criterion.group;
  const blockingError = criterionBlockingError(criterion);
  return (
    <div
      style={blockingError ? invalidRuleRowStyle : active ? activeRuleRowStyle : ruleRowStyle}
      data-testid={`criterion-group-row-${index}`}
      role="button"
      tabIndex={disabled ? undefined : 0}
      onClick={disabled ? undefined : onEdit}
      onKeyDown={
        disabled
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEdit();
              }
            }
      }
    >
      <div style={ruleRowHeaderStyle}>
        <span style={conditionIndexStyle}>{index + 1}</span>
        <span style={criterionTypeBadgeStyle}>{criterion.type}</span>
        <span style={conditionSummaryStyle} data-testid={`criterion-group-summary-${index}`}>
          {summarizeCriterionReadable(criterion)}
        </span>
        {blockingError ? (
          <span style={errorPillStyle}>{g.invalid}</span>
        ) : (
          <span style={okPillStyle}>{g.valid}</span>
        )}
        {!disabled && (
          <div style={rowActionsStyle} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={onEdit} style={compactGhostBtn} data-testid={`criterion-group-edit-${index}`}>
              {blockingError ? g.complete : active ? g.editing : g.edit}
            </button>
            <button type="button" onClick={onMoveUp} disabled={index === 0} style={index === 0 ? disabledCompactGhostBtn : compactGhostBtn} data-testid={`criterion-group-move-up-${index}`}>
              ↑
            </button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} style={!canMoveDown ? disabledCompactGhostBtn : compactGhostBtn} data-testid={`criterion-group-move-down-${index}`}>
              ↓
            </button>
            <details style={rowMenuStyle}>
              <summary style={rowMenuSummaryStyle} data-testid={`criterion-group-actions-${index}`}>
                ⋯
              </summary>
              <div style={rowMenuPanelStyle}>
                <button type="button" onClick={onDuplicate} style={compactGhostBtn} data-testid={`criterion-group-duplicate-${index}`}>
                  {g.duplicate}
                </button>
                <button type="button" onClick={onRemove} style={compactDangerBtn} data-testid={`criterion-group-remove-${index}`}>
                  {g.remove}
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
      {blockingError && (
        <div role="alert" style={errorStyle} data-testid={`criterion-group-row-error-${index}`}>
          {blockingError}
        </div>
      )}
      {children}
    </div>
  );
}

function AddConditionMenu({ onSelect }: { onSelect: (type: CriterionType) => void }) {
  const m = useMessages().criterion;
  return (
    <div style={addMenuStyle} data-testid="criterion-add-menu">
      <span style={previewLabelStyle}>{m.chooseConditionType}</span>
      {CRITERION_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          style={compactGhostBtn}
          data-testid={`criterion-add-${type}`}
        >
          {m.types[type]}
        </button>
      ))}
    </div>
  );
}

function FunctionCriterionFields({
  criterion,
  disabled,
  depth,
  pathKey,
  onChange,
  reportLocalError,
}: {
  criterion: FunctionCriterion;
  disabled: boolean;
  depth: number;
  pathKey: string;
  onChange: (c: Criterion) => void;
  reportLocalError: (key: string, hasError: boolean) => void;
}) {
  const messages = useMessages();
  const f = messages.criterion.function;
  const [configText, setConfigText] = useState(() =>
    criterion.function.config ? JSON.stringify(criterion.function.config, null, 2) : "",
  );
  const configKey = `${pathKey}.function.config`;

  const nameError = criterion.function.name === ""
    ? f.nameEmpty
    : !NAME_REGEX.test(criterion.function.name)
    ? f.nameInvalid
    : null;

  const configError = useMemo(() => {
    if (configText.trim() === "") return null;
    try {
      JSON.parse(configText);
      return null;
    } catch {
      return f.configInvalid;
    }
  }, [configText, f.configInvalid]);

  useEffect(() => {
    reportLocalError(configKey, !!configError);
    return () => reportLocalError(configKey, false);
  }, [configError, configKey, reportLocalError]);

  const updateFunction = (updates: Partial<FunctionCriterion["function"]>) =>
    onChange({ type: "function", function: { ...criterion.function, ...updates } });

  const updateConfig = (value: string) => {
    setConfigText(value);
    if (value.trim() === "") {
      const { config: _config, ...rest } = criterion.function;
      onChange({ type: "function", function: rest });
      return;
    }
    try {
      updateFunction({ config: JSON.parse(value) });
    } catch {
      // Keep invalid JSON local until the user fixes it.
    }
  };

  return (
    <>
      <label style={labelStyle}>
        <span>{f.name}</span>
        <input
          type="text"
          value={criterion.function.name}
          disabled={disabled}
          onChange={(e) => updateFunction({ name: e.target.value })}
          style={nameError ? { ...inputStyle, borderColor: "#FCA5A5" } : inputStyle}
          data-testid="criterion-fn-name"
          aria-invalid={nameError ? true : undefined}
        />
        {nameError && (
          <span role="alert" style={errorStyle} data-testid="criterion-fn-name-error">
            {nameError}
          </span>
        )}
      </label>
      <label style={labelStyle}>
        <span>{f.config}</span>
        <textarea
          value={configText}
          onChange={(e) => updateConfig(e.target.value)}
          disabled={disabled}
          rows={6}
          data-testid="criterion-fn-config"
          style={{ ...jsonTextAreaStyle, minHeight: 140, borderColor: configError ? "#FCA5A5" : "#CBD5E1" }}
          aria-invalid={configError ? true : undefined}
        />
        {configError && (
          <span role="alert" style={errorStyle} data-testid="criterion-fn-config-error">
            {configError}
          </span>
        )}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>{f.precheck}</span>
        {criterion.function.criterion ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  const { criterion: _criterion, ...rest } = criterion.function;
                  onChange({ type: "function", function: rest });
                }}
                style={{ ...dangerBtn, padding: "2px 6px", fontSize: 11 }}
                data-testid="criterion-fn-precheck-remove"
              >
                {f.precheckRemove}
              </button>
            )}
            <CriterionEditorBody
              criterion={criterion.function.criterion}
              disabled={disabled}
              depth={depth + 1}
              pathKey={`${pathKey}.function.criterion`}
              onChange={(nextPrecheck) => updateFunction({ criterion: nextPrecheck })}
              reportLocalError={reportLocalError}
            />
          </div>
        ) : (
          !disabled && (
            <button
              type="button"
              onClick={() =>
                updateFunction({
                  criterion: { type: "simple", jsonPath: "", operation: "EQUALS" },
                })
              }
              disabled={!!nameError || !!configError}
              style={nameError || configError ? disabledGhostBtn : ghostBtn}
              data-testid="criterion-fn-precheck-add"
            >
              {f.precheckAdd}
            </button>
          )
        )}
      </div>
    </>
  );
}

function LifecycleCriterionFields({
  criterion,
  disabled,
  onChange,
}: {
  criterion: LifecycleCriterion;
  disabled: boolean;
  onChange: (c: Criterion) => void;
}) {
  const messages = useMessages();
  const m = messages.criterion;
  const l = messages.criterion.lifecycle;
  const shape = OPERATOR_VALUE_SHAPE[criterion.operation];
  const range = Array.isArray(criterion.value) ? criterion.value : [];
  const low = formatScalar(range[0]);
  const high = formatScalar(range[1]);
  const betweenError = shape === "range" && (low.trim() === "" || high.trim() === "")
    ? m.betweenShape
    : null;
  const updateOperation = (operation: OperatorType) => {
    const next: LifecycleCriterion = { type: "lifecycle", field: criterion.field, operation };
    if (OPERATOR_VALUE_SHAPE[operation] === "range") next.value = ["", ""];
    onChange(next);
  };

  return (
    <>
      <label style={labelStyle}>
        <span>{l.field}</span>
        <CustomSelectInput
          value={criterion.field}
          options={LIFECYCLE_FIELDS.map((f) => ({ value: f, label: f }))}
          disabled={disabled}
          onChange={(next) => onChange({ ...criterion, field: next as LifecycleCriterion["field"] })}
          testId="criterion-lifecycle-field"
        />
      </label>

      <label style={labelStyle}>
        <span>{m.operation}</span>
        <CustomSelectInput
          value={criterion.operation}
          groups={buildOperatorGroups()}
          disabledOption={
            UNSUPPORTED_OPERATORS.has(criterion.operation)
              ? { value: criterion.operation, label: `${criterion.operation} ${m.legacySuffix}` }
              : undefined
          }
          disabled={disabled}
          onChange={(next) => updateOperation(next as OperatorType)}
          testId="criterion-lifecycle-op"
        />
        {criterion.operation === "LIKE" && (
          <span style={hintStyle} data-testid="criterion-lifecycle-like-help">{m.likeHelp}</span>
        )}
        {criterion.operation === "MATCHES_PATTERN" && (
          <span style={hintStyle} data-testid="criterion-lifecycle-matches-help">
            {m.matchesPatternHelpAlways}
          </span>
        )}
      </label>

      {shape === "scalar" && (
        <label style={labelStyle}>
          <span>{m.value}</span>
          <ValueEditor
            value={criterion.value}
            disabled={disabled}
            testId="criterion-lifecycle-value"
            onChange={(raw) => {
              const { value: _value, ...base } = criterion;
              onChange(raw === undefined ? base : { ...criterion, value: raw as never });
            }}
          />
        </label>
      )}

      {shape === "range" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span>{m.low}</span>
              <input
                type="text"
                value={low}
                disabled={disabled}
                onChange={(e) => onChange({ ...criterion, value: [parseScalar(e.target.value), range[1] ?? ""] as never })}
                style={betweenError ? { ...inputStyle, borderColor: "#FCA5A5" } : inputStyle}
                data-testid="criterion-lifecycle-low"
              />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span>{m.high}</span>
              <input
                type="text"
                value={high}
                disabled={disabled}
                onChange={(e) => onChange({ ...criterion, value: [range[0] ?? "", parseScalar(e.target.value)] as never })}
                style={betweenError ? { ...inputStyle, borderColor: "#FCA5A5" } : inputStyle}
                data-testid="criterion-lifecycle-high"
              />
            </label>
          </div>
          {betweenError && (
            <span role="alert" style={errorStyle} data-testid="criterion-lifecycle-between-error">
              {betweenError}
            </span>
          )}
        </div>
      )}

      {shape === "none" && (
        <span style={hintStyle} data-testid="criterion-lifecycle-value-ignored">
          {m.valueIgnored}
        </span>
      )}
    </>
  );
}

function ArrayCriterionFields({
  criterion,
  disabled,
  onChange,
}: {
  criterion: ArrayCriterion;
  disabled: boolean;
  onChange: (c: Criterion) => void;
}) {
  const messages = useMessages();
  const m = messages.criterion;
  const a = messages.criterion.array;
  const g = messages.criterion.group;
  const [newItem, setNewItem] = useState("");
  const pathError = jsonPathError(criterion.jsonPath, m);

  return (
    <>
      <label style={labelStyle}>
        <span>{m.jsonPath}</span>
        <JsonPathInput
          value={criterion.jsonPath}
          onChange={(jsonPath) => onChange({ ...criterion, jsonPath })}
          disabled={disabled}
          hasError={!!pathError}
          inputStyle={inputStyle}
          testIdPrefix="criterion-array"
        />
        {pathError && (
          <span role="alert" style={errorStyle} data-testid="criterion-array-path-error">
            {pathError}
          </span>
        )}
      </label>

      <label style={labelStyle}>
        <span>{m.operation}</span>
        <CustomSelectInput
          value={criterion.operation}
          groups={buildOperatorGroups()}
          disabledOption={
            UNSUPPORTED_OPERATORS.has(criterion.operation)
              ? { value: criterion.operation, label: `${criterion.operation} ${m.legacySuffix}` }
              : undefined
          }
          disabled={disabled}
          onChange={(next) => onChange({ ...criterion, operation: next as OperatorType })}
          testId="criterion-array-op"
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#475569" }}>{a.values}</span>
        {criterion.value.map((v, idx) => (
          <div key={`${v}-${idx}`} style={{ display: "flex", gap: 4, alignItems: "center" }} data-testid={`criterion-array-item-${idx}`}>
            <span style={arrayValueStyle}>{v}</span>
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (idx === 0) return;
                    const next = [...criterion.value];
                    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                    onChange({ ...criterion, value: next });
                  }}
                  disabled={idx === 0}
                  style={{ ...ghostBtn, padding: "2px 6px", fontSize: 11 }}
                  data-testid={`criterion-array-move-up-${idx}`}
                >
                  {g.moveUp}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (idx >= criterion.value.length - 1) return;
                    const next = [...criterion.value];
                    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                    onChange({ ...criterion, value: next });
                  }}
                  disabled={idx === criterion.value.length - 1}
                  style={{ ...ghostBtn, padding: "2px 6px", fontSize: 11 }}
                  data-testid={`criterion-array-move-down-${idx}`}
                >
                  {g.moveDown}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...criterion, value: criterion.value.filter((_, i) => i !== idx) })}
                  style={{ ...dangerBtn, padding: "2px 6px", fontSize: 11 }}
                  data-testid={`criterion-array-remove-${idx}`}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
        {!disabled && (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const trimmed = newItem.trim();
                  if (!trimmed) return;
                  onChange({ ...criterion, value: [...criterion.value, trimmed] });
                  setNewItem("");
                }
              }}
              placeholder={a.addValuePlaceholder}
              style={{ ...inputStyle, flex: 1 }}
              data-testid="criterion-array-new-item"
            />
            <button
              type="button"
              onClick={() => {
                const trimmed = newItem.trim();
                if (!trimmed) return;
                onChange({ ...criterion, value: [...criterion.value, trimmed] });
                setNewItem("");
              }}
              style={ghostBtn}
              data-testid="criterion-array-add-item"
            >
              {a.addValue}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ValueEditor({
  value,
  disabled,
  testId,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  testId: string;
  onChange: (value: unknown | undefined) => void;
}) {
  if (typeof value === "boolean") {
    return (
      <div style={matchControlStyle} data-testid={`${testId}-boolean`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          style={value ? segmentedActiveStyle : segmentedStyle}
        >
          true
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          style={!value ? segmentedActiveStyle : segmentedStyle}
        >
          false
        </button>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw.trim() === "" ? undefined : Number(raw));
        }}
        style={inputStyle}
        data-testid={testId}
      />
    );
  }

  const scalarValue =
    value === undefined || Array.isArray(value) ? "" : formatScalar(value);

  return (
    <input
      type="text"
      value={scalarValue}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw.trim() === "" ? undefined : parseScalar(raw));
      }}
      style={inputStyle}
      data-testid={testId}
    />
  );
}

function CriterionSummary({ criterion }: { criterion: Criterion }) {
  return (
    <p style={summaryTextStyle} data-testid="criterion-summary-text">
      {summarizeCriterionForInspector(criterion)}
    </p>
  );
}

function summarizeCriterionForInspector(criterion: Criterion): string {
  return summarizeCriterionReadable(criterion);
}

function summarizeCriterionReadable(criterion: Criterion): string {
  if (criterion.type === "simple") {
    const missing: string[] = [];
    if (!criterion.jsonPath) missing.push("path");
    const shape = OPERATOR_VALUE_SHAPE[criterion.operation];
    if (
      shape === "scalar" &&
      (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
    ) {
      missing.push("value");
    }
    if (missing.length > 0) {
      if (criterion.jsonPath) {
        return `${criterion.jsonPath} ${operatorLabel(criterion.operation)} [missing ${missing.join("/")}]`;
      }
      return `Incomplete simple condition: ${missing.join("/")} required`;
    }
    const value = criterion.value !== undefined && OPERATOR_VALUE_SHAPE[criterion.operation] !== "none"
      ? ` ${formatScalar(criterion.value)}`
      : "";
    return `${criterion.jsonPath || "$.…"} ${operatorLabel(criterion.operation)}${value}`;
  }
  if (criterion.type === "group") {
    const count = criterion.conditions.length;
    if (criterion.operator === "OR") return `Any of ${count} condition${count === 1 ? "" : "s"}`;
    if (criterion.operator === "AND") return `All of ${count} condition${count === 1 ? "" : "s"}`;
    return `${criterion.operator} · ${count} condition${count === 1 ? "" : "s"}`;
  }
  if (criterion.type === "function") {
    return `Function ${criterion.function.name || "…"}`;
  }
  if (criterion.type === "lifecycle") {
    const value = criterion.value !== undefined && OPERATOR_VALUE_SHAPE[criterion.operation] !== "none"
      ? ` ${formatScalar(criterion.value)}`
      : "";
    return `${criterion.field} ${operatorLabel(criterion.operation)}${value}`;
  }
  return `${criterion.jsonPath || "$.…"} ${operatorLabel(criterion.operation)} (${criterion.value.length} values)`;
}

function criterionBlockingError(criterion: Criterion): string | null {
  switch (criterion.type) {
    case "simple": {
      const pathError = jsonPathBlockingError(criterion.jsonPath);
      if (pathError) return pathError;
      if (
        OPERATOR_VALUE_SHAPE[criterion.operation] === "scalar" &&
        (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
      ) {
        return "Value is required.";
      }
      return rangeBlockingError(criterion.operation, criterion.value);
    }
    case "array":
      return jsonPathBlockingError(criterion.jsonPath);
    case "lifecycle":
      if (!NAME_REGEX.test(criterion.field)) return null;
      return rangeBlockingError(criterion.operation, criterion.value);
    case "function":
      if (!criterion.function.name || !NAME_REGEX.test(criterion.function.name)) {
        return "Function name is invalid.";
      }
      return criterion.function.criterion ? criterionBlockingError(criterion.function.criterion) : null;
    case "group":
      for (const child of criterion.conditions) {
        const childError = criterionBlockingError(child);
        if (childError) return childError;
      }
      return null;
  }
}

function jsonPathBlockingError(jsonPath: string): string | null {
  if (jsonPath === "") return "Path is required.";
  const check = validateJsonPathSubset(jsonPath);
  return check.ok ? null : `JSON path is invalid (${check.reason}).`;
}

function rangeBlockingError(operation: OperatorType, value: unknown): string | null {
  if (operation !== "BETWEEN" && operation !== "BETWEEN_INCLUSIVE") return null;
  return Array.isArray(value) &&
    value.length === 2 &&
    formatScalar(value[0]).trim() !== "" &&
    formatScalar(value[1]).trim() !== ""
    ? null
    : "BETWEEN requires both Low and High values.";
}

function jsonPathError(jsonPath: string, messages: ReturnType<typeof useMessages>["criterion"]): string | null {
  if (jsonPath === "") return messages.jsonPathError.empty;
  const pathCheck = validateJsonPathSubset(jsonPath);
  return pathCheck.ok ? null : messages.jsonPathError[pathCheck.reason as JsonPathRejectReason];
}

function formatScalar(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function parseScalar(s: string): unknown {
  const trimmed = s.trim();
  if (trimmed === "") return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return s;
  }
}

type ValueEditorKind = "text" | "date" | "datetime-local";

function getValueEditorKind(jsonPath: string, hints: FieldHint[]): ValueEditorKind {
  const path = jsonPath.trim();
  if (!path) return "text";
  const hint = hints.find((h) => h.jsonPath === path);
  const descriptor = `${hint?.type ?? ""} ${hint?.description ?? ""} ${path}`.toLowerCase();
  const lastSegment = path.split(/[.[\]]+/).filter(Boolean).at(-1) ?? path;
  const normalizedSegment = lastSegment.toLowerCase();
  const isDateTime =
    /\b(date.?time|datetime|timestamp|local_date_time|instant)\b/.test(descriptor) ||
    normalizedSegment.includes("timestamp") ||
    normalizedSegment.includes("datetime") ||
    normalizedSegment.includes("time") ||
    normalizedSegment.endsWith("at");
  if (isDateTime) return "datetime-local";
  const isDate =
    /\b(date|local_date)\b/.test(descriptor) ||
    normalizedSegment.includes("date");
  return isDate ? "date" : "text";
}

function dateFormatHint(kind: ValueEditorKind): string {
  return kind === "datetime-local" ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DD";
}

function operatorLabel(operator: OperatorType): string {
  return OPERATOR_LABELS[operator] ?? operator;
}

function buildOperatorGroups() {
  return OPERATOR_GROUPS
    .map((g) => ({
      groupLabel: g.label,
      options: g.operators
        .filter((o) => SUPPORTED_SIMPLE_OPERATORS.has(o))
        .map((o) => ({ value: o, label: operatorLabel(o) })),
    }))
    .filter((g) => g.options.length > 0);
}

function isActivePath(activeKey: string, pathKey: string): boolean {
  return activeKey === pathKey || activeKey.startsWith(`${pathKey}.`);
}

const OPERATOR_LABELS: Partial<Record<OperatorType, string>> = {
  EQUALS: "is",
  IEQUALS: "is (ignore case)",
  NOT_EQUAL: "is not",
  INOT_EQUAL: "is not (ignore case)",
  GREATER_THAN: "is greater than",
  LESS_THAN: "is less than",
  GREATER_OR_EQUAL: "is greater than or equal to",
  LESS_OR_EQUAL: "is less than or equal to",
  BETWEEN: "is between",
  BETWEEN_INCLUSIVE: "is between, inclusive",
  MATCHES_PATTERN: "matches regex",
  LIKE: "matches pattern",
  IS_NULL: "is empty",
  NOT_NULL: "is not empty",
  CONTAINS: "contains",
  NOT_CONTAINS: "does not contain",
  ICONTAINS: "contains (ignore case)",
  INOT_CONTAINS: "does not contain (ignore case)",
  STARTS_WITH: "starts with",
  NOT_STARTS_WITH: "does not start with",
  ISTARTS_WITH: "starts with (ignore case)",
  INOT_STARTS_WITH: "does not start with (ignore case)",
  ENDS_WITH: "ends with",
  NOT_ENDS_WITH: "does not end with",
  IENDS_WITH: "ends with (ignore case)",
  INOT_ENDS_WITH: "does not end with (ignore case)",
};

function SectionHeader({ label, badge }: { label: string; badge: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, padding: "1px 6px", background: "#F1F5F9", borderRadius: 999, color: "#64748b" }}>
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
  border: "1px solid #CBD5E1",
  borderRadius: 6,
  background: "white",
};
const summaryTextStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 };
const warningCardStyle: React.CSSProperties = {
  margin: 0,
  padding: "6px 8px",
  background: "#FFFBEB",
  border: "1px solid #FCD34D",
  borderRadius: 4,
  color: "#92400E",
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
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  background: "#F8FAFC",
};
const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "sticky",
  bottom: 0,
  paddingTop: 10,
  borderTop: "1px solid #E2E8F0",
  background: "white",
};
const advancedStyle: React.CSSProperties = { minWidth: 130 };
const advancedSummaryStyle: React.CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  cursor: "pointer",
  fontSize: 12,
  color: "#475569",
};
const subheadingStyle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 700, color: "#0F172A" };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#334155" };
const inputStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderWidth: 1, borderStyle: "solid", borderColor: "#CBD5E1", borderRadius: 4, background: "white" };
const jsonTextAreaStyle: React.CSSProperties = { fontFamily: "monospace", fontSize: 12, padding: 8, borderWidth: 1, borderStyle: "solid", borderColor: "#CBD5E1", borderRadius: 4, background: "white", resize: "vertical" };
const ghostBtn: React.CSSProperties = { padding: "6px 10px", background: "white", border: "1px solid #CBD5E1", borderRadius: 4, fontSize: 12, cursor: "pointer" };
const disabledGhostBtn: React.CSSProperties = { ...ghostBtn, opacity: 0.5, cursor: "not-allowed" };
const primaryBtn: React.CSSProperties = { ...ghostBtn, background: "#0F172A", color: "white", borderColor: "#0F172A" };
const disabledPrimaryBtn: React.CSSProperties = { ...primaryBtn, opacity: 0.5, cursor: "not-allowed" };
const dangerBtn: React.CSSProperties = { ...ghostBtn, background: "#FEF2F2", borderColor: "#FCA5A5", color: "#B91C1C" };
const compactGhostBtn: React.CSSProperties = { ...ghostBtn, padding: "4px 7px", fontSize: 11 };
const disabledCompactGhostBtn: React.CSSProperties = { ...compactGhostBtn, opacity: 0.35, cursor: "not-allowed" };
const compactDangerBtn: React.CSSProperties = { ...dangerBtn, padding: "4px 7px", fontSize: 11 };
const errorStyle: React.CSSProperties = { color: "#B91C1C", fontSize: 11 };
const warningStyle: React.CSSProperties = { color: "#92400E", fontSize: 11 };
const hintStyle: React.CSSProperties = { color: "#64748B", fontSize: 11, fontStyle: "italic" };
const depthWarningStyle: React.CSSProperties = { padding: "6px 8px", background: "#FFFBEB", borderWidth: 1, borderStyle: "solid", borderColor: "#FCD34D", borderRadius: 4, color: "#92400E", fontSize: 11 };
const arrayValueStyle: React.CSSProperties = { flex: 1, fontSize: 12, padding: "4px 6px", background: "#F1F5F9", borderRadius: 3 };
const builderStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const previewStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "8px 10px",
  borderRadius: 6,
  background: "white",
  border: "1px solid #E2E8F0",
  color: "#0F172A",
  fontSize: 13,
};
const previewLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#64748B",
  letterSpacing: "0.08em",
};
const ruleEditorStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 10,
  borderRadius: 6,
  background: "white",
  border: "1px solid #E2E8F0",
};
const ruleEditorHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  gap: 8,
  alignItems: "center",
};
const ruleEditorActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  paddingTop: 2,
};
const groupBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 10,
  borderRadius: 6,
  background: "white",
};
const nestedGroupBlockStyle: React.CSSProperties = {
  borderLeft: "3px solid #CBD5E1",
  borderRadius: 0,
  background: "#F8FAFC",
  paddingLeft: 12,
};
const groupHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};
const matchControlStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap",
};
const matchLabelStyle: React.CSSProperties = {
  marginRight: 4,
  fontSize: 12,
  color: "#475569",
  fontWeight: 600,
};
const segmentedStyle: React.CSSProperties = {
  ...ghostBtn,
  padding: "5px 9px",
  borderRadius: 999,
  background: "#F8FAFC",
};
const segmentedActiveStyle: React.CSSProperties = {
  ...segmentedStyle,
  background: "#0F172A",
  border: "1px solid #0F172A",
  color: "white",
};
const ruleListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const connectorRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  margin: "-2px 0",
};
const connectorChipStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  color: "#475569",
  background: "#E2E8F0",
  letterSpacing: "0.04em",
};
const ruleRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "7px 8px",
  borderRadius: 6,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};
const activeRuleRowStyle: React.CSSProperties = {
  ...ruleRowStyle,
  background: "#FFFFFF",
  border: "1px solid #94A3B8",
};
const invalidRuleRowStyle: React.CSSProperties = {
  ...ruleRowStyle,
  background: "#FFFBEB",
  border: "1px solid #FCD34D",
  cursor: "pointer",
};
const ruleRowHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto auto minmax(120px, 1fr) auto auto",
  alignItems: "center",
  gap: 8,
};
const rowActionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 4,
};
const rowMenuStyle: React.CSSProperties = { position: "relative" };
const rowMenuSummaryStyle: React.CSSProperties = {
  ...compactGhostBtn,
  listStyle: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
};
const rowMenuPanelStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  zIndex: 2,
  display: "flex",
  gap: 4,
  padding: 6,
  marginTop: 4,
  border: "1px solid #CBD5E1",
  borderRadius: 6,
  background: "white",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.14)",
};
const okPillStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 999,
  background: "#ECFDF5",
  color: "#047857",
};
const errorPillStyle: React.CSSProperties = {
  ...okPillStyle,
  background: "#FEF2F2",
  color: "#B91C1C",
};
const addMenuStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 6,
  padding: 8,
  borderRadius: 6,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};
const groupActionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
const emptyGroupStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px dashed #CBD5E1",
  background: "#F8FAFC",
  color: "#64748B",
  fontSize: 12,
};
const conditionIndexStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#E2E8F0",
  color: "#334155",
  fontSize: 11,
  fontWeight: 700,
};
const criterionTypeBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "1px 6px",
  borderRadius: 999,
  background: "#F1F5F9",
  color: "#475569",
  flexShrink: 0,
};
const conditionSummaryStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  color: "#334155",
};
const nestedEditorStyle: React.CSSProperties = {
  paddingTop: 8,
  borderTop: "1px solid #E2E8F0",
};
