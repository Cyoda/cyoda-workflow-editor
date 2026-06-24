import type { EditorLike, MonacoLike, TextModelLike } from "./types.js";

export interface MonacoUriLike {
  toString(): string;
}

export interface WorkflowJsonModelLike extends TextModelLike {
  dispose(): void;
}

export interface WorkflowJsonEditorInstance extends EditorLike {
  dispose(): void;
  layout?: () => void;
  updateOptions?: (options: Record<string, unknown>) => void;
}

export interface WorkflowJsonMonacoRuntime extends MonacoLike {
  Uri: { parse(value: string): MonacoUriLike };
  editor: MonacoLike["editor"] & {
    createModel(value: string, language?: string, uri?: MonacoUriLike): WorkflowJsonModelLike;
    create(element: HTMLElement, options: Record<string, unknown>): WorkflowJsonEditorInstance;
  };
}
