import { useMemo, useState } from "react";
import type {
  DomainPatch,
  EntityFieldHintProvider,
  ValidationIssue,
  WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { serializeEditorDocument } from "@cyoda/workflow-core";
import { useEditorConfig, useMessages } from "../i18n/context.js";
import type { Selection } from "../state/types.js";
import { colors, fonts, radii, severityTone } from "../style/tokens.js";
import { processorUuidsInOrder, resolveSelection } from "./resolve.js";
import { WorkflowForm } from "./WorkflowForm.js";
import { StateForm } from "./StateForm.js";
import { TransitionForm } from "./TransitionForm.js";
import { ProcessorForm } from "./ProcessorForm.js";
import { FieldHintsProvider } from "./criteria/FieldHintsContext.js";

export interface InspectorProps {
  document: WorkflowEditorDocument;
  selection: Selection;
  issues: ValidationIssue[];
  readOnly: boolean;
  onDispatch: (patch: DomainPatch) => void;
  onSelectionChange: (sel: Selection) => void;
  onClose?: () => void;
  onRequestDeleteState: (workflow: string, stateCode: string) => void;
  width?: number;
  /**
   * Optional model-schema autocomplete source for criterion jsonPath inputs.
   * When omitted, jsonPath inputs render as plain free-text fields.
   */
  hintProvider?: EntityFieldHintProvider;
}

function issueKeyForSelection(selection: Selection): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "workflow":
      return selection.workflow;
    case "state":
      return selection.nodeId;
    case "transition":
      return selection.transitionUuid;
    case "processor":
      return selection.processorUuid;
    case "criterion":
      return selection.hostId;
  }
}

export function Inspector({
  document: doc,
  selection,
  issues,
  readOnly,
  onDispatch,
  onSelectionChange,
  onClose,
  onRequestDeleteState,
  hintProvider,
  width = 384,
}: InspectorProps) {
  const messages = useMessages();
  const { developerMode } = useEditorConfig();
  const [tab, setTab] = useState<"properties" | "json">("properties");
  const effectiveTab = developerMode ? tab : "properties";
  const resolved = useMemo(() => resolveSelection(doc, selection), [doc, selection]);

  const selectionIssueKey = issueKeyForSelection(selection);
  const selectionIssues = useMemo(() => {
    if (!selectionIssueKey) return [];
    return issues.filter((i) => i.targetId === selectionIssueKey);
  }, [issues, selectionIssueKey]);

  const breadcrumb = renderBreadcrumb(resolved);

  return (
    <FieldHintsProvider provider={hintProvider} entity={doc.session.entity}>
    <aside
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: colors.surfaceMuted,
        borderLeft: `1px solid ${colors.borderSubtle}`,
        flex: `0 0 ${width}px`,
        width,
        minWidth: 360,
        fontFamily: fonts.sans,
      }}
      data-testid="inspector"
    >
      <header
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${colors.borderSubtle}`,
          fontSize: 12,
          color: colors.textSecondary,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {breadcrumb}
        </span>
        {onClose && (
          <button
            type="button"
            aria-label="Close inspector"
            data-testid="inspector-close"
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.sm,
              background: "white",
              color: colors.textSecondary,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: "18px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </header>
      {developerMode && (
        <div style={{ display: "flex", borderBottom: `1px solid ${colors.borderSubtle}` }}>
          <TabButton
            active={effectiveTab === "properties"}
            onClick={() => setTab("properties")}
            testId="inspector-tab-properties"
          >
            {messages.inspector.properties}
          </TabButton>
          <TabButton
            active={effectiveTab === "json"}
            onClick={() => setTab("json")}
            testId="inspector-tab-json"
          >
            {messages.inspector.json}
          </TabButton>
        </div>
      )}
      <div style={{ padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {effectiveTab === "properties" && (
          <>
            {!resolved && <EmptyState message={messages.inspector.empty} />}
            {resolved?.kind === "workflow" && (
              <WorkflowForm workflow={resolved.workflow} disabled={readOnly} onDispatch={onDispatch} />
            )}
            {resolved?.kind === "state" && (
              <StateForm
                workflow={resolved.workflow}
                stateCode={resolved.stateCode}
                state={resolved.state}
                disabled={readOnly}
                issues={selectionIssues}
                onDispatch={onDispatch}
                onRequestDelete={() =>
                  onRequestDeleteState(resolved.workflow.name, resolved.stateCode)
                }
              />
            )}
            {resolved?.kind === "transition" && (
              <TransitionForm
                workflow={resolved.workflow}
                stateCode={resolved.stateCode}
                transition={resolved.transition}
                transitionUuid={resolved.transitionUuid}
                transitionIndex={resolved.transitionIndex}
                processorUuids={processorUuidsInOrder(doc, resolved.transitionUuid)}
                anchors={
                  doc.meta.workflowUi[resolved.workflow.name]?.edgeAnchors?.[
                    resolved.transitionUuid
                  ]
                }
                disabled={readOnly}
                issues={selectionIssues}
                onDispatch={onDispatch}
                onSelectionChange={onSelectionChange}
              />
            )}
            {resolved?.kind === "processor" && (
              <ProcessorForm
                processor={resolved.processor}
                processorUuid={resolved.processorUuid}
                processorIndex={resolved.processorIndex}
                transitionUuid={resolved.transitionUuid}
                workflow={resolved.workflow}
                disabled={readOnly}
                onDispatch={onDispatch}
              />
            )}
          </>
        )}
        {developerMode && effectiveTab === "json" && (
          <JsonPreview document={doc} resolved={resolved} />
        )}

        {selectionIssues.length > 0 && (
          <IssuesList issues={selectionIssues} title={messages.inspector.issues} />
        )}
      </div>
    </aside>
    </FieldHintsProvider>
  );
}

function renderBreadcrumb(resolved: ReturnType<typeof resolveSelection>): string {
  if (!resolved) return "";
  if (resolved.kind === "workflow") return resolved.workflow.name;
  if (resolved.kind === "state")
    return `${resolved.workflow.name} › ${resolved.stateCode}`;
  if (resolved.kind === "transition")
    return `${resolved.workflow.name} › ${resolved.stateCode} › ${resolved.transition.name}`;
  if (resolved.kind === "processor")
    return `${resolved.workflow.name} › ${resolved.stateCode} › ${resolved.transition.name} › ${resolved.processor.name}`;
  return "";
}

function TabButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        flex: 1,
        padding: "8px 12px",
        background: active ? "white" : "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${colors.primary}` : "2px solid transparent",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p style={{ color: colors.textTertiary, fontSize: 13 }}>{message}</p>;
}

function IssuesList({
  issues,
  title,
}: {
  issues: ValidationIssue[];
  title: string;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <header style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textSecondary }}>
        {title}
      </header>
      {issues.map((issue, i) => {
        const tone = severityTone(issue.severity);
        return (
          <div
            key={`${issue.code}-${i}`}
            style={{
              padding: 8,
              border: `1px solid ${tone.border}`,
              background: tone.bg,
              borderRadius: radii.sm,
              fontSize: 12,
            }}
          >
            <strong>{issue.code}</strong>
            <div>{issue.message}</div>
          </div>
        );
      })}
    </section>
  );
}

function JsonPreview({
  document: doc,
  resolved,
}: {
  document: WorkflowEditorDocument;
  resolved: ReturnType<typeof resolveSelection>;
}) {
  const json = useMemo(() => {
    if (!resolved) return serializeEditorDocument(doc);
    if (resolved.kind === "workflow") return JSON.stringify(resolved.workflow, null, 2);
    if (resolved.kind === "state") return JSON.stringify(resolved.state, null, 2);
    if (resolved.kind === "transition") return JSON.stringify(resolved.transition, null, 2);
    if (resolved.kind === "processor") return JSON.stringify(resolved.processor, null, 2);
    return "";
  }, [doc, resolved]);
  return (
    <pre
      style={{
        fontFamily: fonts.mono,
        fontSize: 12,
        margin: 0,
        padding: 8,
        background: "white",
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radii.sm,
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "auto",
      }}
      data-testid="inspector-json"
    >
      {json}
    </pre>
  );
}
