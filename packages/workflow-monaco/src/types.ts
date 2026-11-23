/**
 * Structural subset of the Monaco editor surface we rely on.
 * Typed structurally so callers can pass the `monaco-editor` module or any
 * compatible reimplementation (e.g. `@monaco-editor/react`'s `monaco` instance)
 * without us hard-depending on their class types.
 */

export interface MarkerData {
  severity: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  code?: string;
  source?: string;
}

export interface Position {
  lineNumber: number;
  column: number;
}

export interface Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface TextModelLike {
  uri: { toString(): string };
  getValue(): string;
  setValue(v: string): void;
  getPositionAt(offset: number): Position;
  getOffsetAt(position: Position): number;
  onDidChangeContent(listener: () => void): { dispose(): void };
}

export interface EditorLike {
  getModel(): TextModelLike | null;
  setModel(model: TextModelLike | null): void;
  setSelection(range: Range): void;
  revealRangeInCenterIfOutsideViewport(range: Range): void;
  onDidChangeCursorPosition(listener: (e: { position: Position }) => void): {
    dispose(): void;
  };
}

export interface JsonDiagnosticsOptions {
  validate?: boolean;
  allowComments?: boolean;
  // `schema` optional and `unknown` to match monaco-editor's own
  // `DiagnosticsOptions` (`readonly schema?: any`), so the real module is
  // assignable to MonacoLike without a cast.
  schemas?: Array<{
    uri: string;
    fileMatch?: string[];
    schema?: unknown;
  }>;
  // No `[k: string]: unknown` index signature: monaco's `DiagnosticsOptions`
  // is an interface, which TypeScript won't match against one. Other options
  // still survive registration — the existing object is spread through.
}

/** The JSON language service defaults the schema registration writes to. */
export interface JsonLanguageDefaults {
  diagnosticsOptions: JsonDiagnosticsOptions;
  setDiagnosticsOptions(opts: JsonDiagnosticsOptions): void;
}

export interface MonacoLike {
  editor: {
    setModelMarkers(model: TextModelLike, owner: string, markers: MarkerData[]): void;
  };
  /**
   * monaco-editor >= 0.55: the JSON language feature is the top-level `json`
   * namespace. 0.56 removed the `languages.json` alias below.
   */
  json?: { jsonDefaults: JsonLanguageDefaults };
  /**
   * monaco-editor < 0.56 (and `@monaco-editor/react` instances of those):
   * `languages.json`. From 0.56 it is typed as a `{ deprecated: true }`
   * tombstone with no `jsonDefaults`, hence optional. Either this or `json`
   * must provide the defaults; see `jsonDefaultsOf`.
   */
  languages?: { json?: { jsonDefaults: JsonLanguageDefaults } | { deprecated: true } };
  MarkerSeverity: {
    Error: number;
    Warning: number;
    Info: number;
    Hint: number;
  };
}

export interface JsonSchemaHandle {
  schemaUri: string;
  fileMatchPrefix: string;
  dispose(): void;
}
