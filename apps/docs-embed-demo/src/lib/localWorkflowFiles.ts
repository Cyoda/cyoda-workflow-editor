export interface LocalWorkflowWritable {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}

export interface LocalWorkflowFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<LocalWorkflowWritable>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  types?: FilePickerAcceptType[];
}

interface SaveFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

interface FileSystemAccessWindow {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<LocalWorkflowFileHandle[]>;
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<LocalWorkflowFileHandle>;
}

export interface OpenedWorkflowFile {
  name: string;
  text: string;
  handle: LocalWorkflowFileHandle | null;
}

const workflowFileTypes: FilePickerAcceptType[] = [
  {
    description: "Cyoda workflow JSON",
    accept: {
      "application/json": [".json", ".cyoda.json"],
    },
  },
];

function fileSystemWindow(): Window & FileSystemAccessWindow {
  return window as Window & FileSystemAccessWindow;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function supportsFileSystemAccess(): boolean {
  if (typeof window === "undefined") return false;
  const target = fileSystemWindow();
  return (
    typeof target.showOpenFilePicker === "function"
    && typeof target.showSaveFilePicker === "function"
  );
}

export async function readWorkflowFileHandle(
  handle: LocalWorkflowFileHandle,
): Promise<OpenedWorkflowFile> {
  const file = await handle.getFile();
  return {
    name: file.name || handle.name,
    text: await file.text(),
    handle,
  };
}

export async function openWorkflowFile(): Promise<OpenedWorkflowFile | null> {
  if (typeof window === "undefined") return null;

  if (supportsFileSystemAccess()) {
    try {
      const [handle] = await fileSystemWindow().showOpenFilePicker?.({
        excludeAcceptAllOption: false,
        multiple: false,
        types: workflowFileTypes,
      }) ?? [];

      if (!handle) return null;
      return readWorkflowFileHandle(handle);
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }

  return openWorkflowFileInput();
}

async function openWorkflowFileInput(): Promise<OpenedWorkflowFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.cyoda.json,application/json";

    let settled = false;

    const finalize = (value: OpenedWorkflowFile | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onWindowFocus);
      resolve(value);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => finalize(null), 0);
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        finalize(null);
        return;
      }

      finalize({
        name: file.name,
        text: await file.text(),
        handle: null,
      });
    });

    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  });
}

export async function pickSaveWorkflowFile(
  suggestedName: string,
): Promise<LocalWorkflowFileHandle | null> {
  if (!supportsFileSystemAccess()) return null;

  try {
    return await fileSystemWindow().showSaveFilePicker?.({
      suggestedName,
      types: workflowFileTypes,
    }) ?? null;
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

export async function saveWorkflowFile(
  handle: LocalWorkflowFileHandle,
  contents: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export function downloadWorkflowJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
