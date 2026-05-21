import { useEffect, useMemo, useState } from "react";
import {
  serializeImportPayload,
  type ValidationIssue,
  type WorkflowEditorDocument
} from "@cyoda/workflow-core";
import { WorkflowEditor } from "@cyoda/workflow-react";
import { getMonacoRuntime } from "../lib/monacoRuntime.js";
import {
  downloadWorkflowJson,
  openWorkflowFile,
  pickSaveWorkflowFile,
  readWorkflowFileHandle,
  saveWorkflowFile,
  supportsFileSystemAccess,
  type LocalWorkflowFileHandle,
  type OpenedWorkflowFile,
} from "../lib/localWorkflowFiles.js";
import { parseLocalWorkflowFile } from "../lib/localWorkflowParsing.js";

type PendingModal =
  | { kind: "discard-open" }
  | { kind: "discard-reload" }
  | { kind: "overwrite-save" }
  | null;

type MessageTone = "error" | "info" | "success";

interface BannerMessage {
  tone: MessageTone;
  text: string;
}

function summarizeIssues(issues: ValidationIssue[]): string {
  const summary = issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );

  if (summary.error === 0 && summary.warning === 0 && summary.info === 0) {
    return "No validation issues";
  }

  return `${summary.error} errors · ${summary.warning} warnings · ${summary.info} infos`;
}

function MessageBanner({ message }: { message: BannerMessage }) {
  return (
    <div
      className={`local-file-editor__message local-file-editor__message--${message.tone}`}
      role={message.tone === "error" ? "alert" : "status"}
    >
      {message.text}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="local-file-editor__modal-backdrop" data-testid="local-file-editor-modal">
      <div className="local-file-editor__modal-frame" role="dialog" aria-modal="true" aria-labelledby="local-file-editor-modal-title">
        <h2 id="local-file-editor-modal-title">{title}</h2>
        <p>{description}</p>
        <div className="local-file-editor__modal-actions">
          <button type="button" className="action-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="action-button action-button--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LocalFileEditorPage() {
  const monaco = useMemo(() => getMonacoRuntime(), []);
  const fileSystemAccess = supportsFileSystemAccess();
  const [document, setDocument] = useState<WorkflowEditorDocument | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [fileHandle, setFileHandle] = useState<LocalWorkflowFileHandle | null>(null);
  const [baselineSerialized, setBaselineSerialized] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<BannerMessage | null>(
    fileSystemAccess
      ? null
      : {
          tone: "info",
          text: "Direct save back to disk is only available in browsers that support the File System Access API. In this browser, use Download instead.",
        },
  );
  const [pendingModal, setPendingModal] = useState<PendingModal>(null);

  useEffect(() => {
    if (!dirty) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const loadOpenedWorkflow = async (opened: OpenedWorkflowFile, successPrefix: string) => {
    try {
      const parsed = parseLocalWorkflowFile(opened.text);
      const serialized = serializeImportPayload(parsed.document);
      setDocument(parsed.document);
      setIssues(parsed.issues);
      setCurrentFileName(opened.name);
      setFileHandle(opened.handle);
      setBaselineSerialized(serialized);
      setDirty(false);
      setMessage({
        tone: "success",
        text: `${successPrefix} ${opened.name}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown parse error.";
      setMessage({
        tone: "error",
        text: `Unable to open workflow file: ${detail}`,
      });
    }
  };

  const handleOpen = async () => {
    const opened = await openWorkflowFile();
    if (!opened) return;
    await loadOpenedWorkflow(opened, "Opened");
  };

  const handleReload = async () => {
    if (!fileHandle) return;
    try {
      const opened = await readWorkflowFileHandle(fileHandle);
      await loadOpenedWorkflow(opened, "Reloaded");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown read error.";
      setMessage({
        tone: "error",
        text: `Unable to reload workflow file: ${detail}`,
      });
    }
  };

  const requestOpen = () => {
    if (dirty) {
      setPendingModal({ kind: "discard-open" });
      return;
    }
    void handleOpen();
  };

  const requestReload = () => {
    if (dirty) {
      setPendingModal({ kind: "discard-reload" });
      return;
    }
    void handleReload();
  };

  const writeSerializedDocument = async (handle: LocalWorkflowFileHandle, fileName: string) => {
    if (!document) return;
    const serialized = serializeImportPayload(document);

    try {
      await saveWorkflowFile(handle, serialized);
      setFileHandle(handle);
      setCurrentFileName(fileName);
      setBaselineSerialized(serialized);
      setDirty(false);
      setMessage({
        tone: "success",
        text: `Saved to ${fileName}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown write error.";
      setMessage({
        tone: "error",
        text: `Unable to save workflow file: ${detail}`,
      });
    }
  };

  const requestSave = () => {
    if (!document) return;

    if (!fileSystemAccess || !fileHandle) {
      const filename = currentFileName || "workflow.json";
      downloadWorkflowJson(filename, serializeImportPayload(document));
      setMessage({
        tone: "success",
        text: `Downloaded ${filename}`,
      });
      return;
    }

    setPendingModal({ kind: "overwrite-save" });
  };

  const handleSaveAs = async () => {
    if (!document) return;

    const suggestedName = currentFileName || "workflow.json";
    if (!fileSystemAccess) {
      downloadWorkflowJson(suggestedName, serializeImportPayload(document));
      setMessage({
        tone: "success",
        text: `Downloaded ${suggestedName}`,
      });
      return;
    }

    const handle = await pickSaveWorkflowFile(suggestedName);
    if (!handle) return;
    await writeSerializedDocument(handle, handle.name || suggestedName);
  };

  const issueSummary = summarizeIssues(issues);

  return (
    <section className="local-file-editor" data-testid="local-file-editor-page">
      <div className="local-file-editor__toolbar">
        <div className="local-file-editor__toolbar-group">
          <a href="/" className="local-file-editor__back-link">
            Back to demo routes
          </a>
          <button
            type="button"
            className="action-button"
            data-testid="local-file-editor-open-toolbar"
            onClick={() => void requestOpen()}
          >
            Open workflow file
          </button>
        </div>

        <div className="local-file-editor__toolbar-group local-file-editor__toolbar-group--meta">
          <span className="local-file-editor__file-name">
            {currentFileName || "No file opened"}
          </span>
          {dirty && <span className="local-file-editor__dirty">Unsaved changes</span>}
          <span className="local-file-editor__status-chip">{issueSummary}</span>
        </div>

        <div className="local-file-editor__toolbar-group">
          <button
            type="button"
            className="action-button action-button--primary"
            data-testid="local-file-editor-save"
            onClick={() => void requestSave()}
            disabled={!document}
          >
            {fileSystemAccess ? "Save" : "Download"}
          </button>
          <button
            type="button"
            className="action-button"
            data-testid="local-file-editor-save-as"
            onClick={() => void handleSaveAs()}
            disabled={!document}
          >
            Save as
          </button>
          <button
            type="button"
            className="action-button"
            data-testid="local-file-editor-reload"
            onClick={() => void requestReload()}
            disabled={!fileHandle}
          >
            Reload from disk
          </button>
        </div>
      </div>

      {message && <MessageBanner message={message} />}

      {!document ? (
        <div className="local-file-editor__empty" data-testid="local-file-editor-empty">
          <div className="local-file-editor__empty-card">
            <h1>Open a workflow JSON file</h1>
            <p>Choose a Cyoda workflow import JSON file from your local drive.</p>
            <button
              type="button"
              className="action-button action-button--primary"
              data-testid="local-file-editor-open-empty"
              onClick={() => void requestOpen()}
            >
              Open workflow file
            </button>
          </div>
        </div>
      ) : (
        <div className="local-file-editor__workspace">
          <div className="local-file-editor__editor-shell" data-testid="local-file-editor-shell">
            <WorkflowEditor
              document={document}
              mode="editor"
              chrome={{ toolbar: false }}
              localStorageKey={null}
              enableJsonEditor
              jsonEditorPlacement="tab"
              jsonEditor={{ monaco, modelUri: `cyoda://local-file-editor/${currentFileName || "workflow.json"}` }}
              onChange={(nextDocument) => {
                const serialized = serializeImportPayload(nextDocument);
                setDocument(nextDocument);
                setDirty(serialized !== baselineSerialized);
              }}
              onSave={() => {
                requestSave();
              }}
              developerMode={true}
            />
          </div>
        </div>
      )}

      {pendingModal?.kind === "overwrite-save" && (
        <ConfirmModal
          title="Overwrite local file?"
          description={`This will overwrite ${currentFileName}.`}
          cancelLabel="Cancel"
          confirmLabel="Overwrite file"
          onCancel={() => setPendingModal(null)}
          onConfirm={() => {
            setPendingModal(null);
            if (fileHandle && currentFileName) {
              void writeSerializedDocument(fileHandle, currentFileName);
            }
          }}
        />
      )}

      {pendingModal?.kind === "discard-open" && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="Opening another file will discard your unsaved changes in the current editor session."
          cancelLabel="Cancel"
          confirmLabel="Discard changes"
          onCancel={() => setPendingModal(null)}
          onConfirm={() => {
            setPendingModal(null);
            void handleOpen();
          }}
        />
      )}

      {pendingModal?.kind === "discard-reload" && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="Reloading from disk will discard your unsaved changes in the current editor session."
          cancelLabel="Cancel"
          confirmLabel="Discard changes"
          onCancel={() => setPendingModal(null)}
          onConfirm={() => {
            setPendingModal(null);
            void handleReload();
          }}
        />
      )}
    </section>
  );
}
