import { createContext, useContext } from "react";
import { defaultMessages, type Messages } from "./en.js";

export const I18nContext = createContext<Messages>(defaultMessages);

export function useMessages(): Messages {
  return useContext(I18nContext);
}

export type PartialMessages = {
  [K in keyof Messages]?: Partial<Messages[K]>;
};

export function mergeMessages(overrides?: PartialMessages): Messages {
  if (!overrides) return defaultMessages;
  const next: Record<string, unknown> = { ...defaultMessages };
  for (const key of Object.keys(overrides)) {
    const base = (defaultMessages as Record<string, unknown>)[key] ?? {};
    const patch = (overrides as Record<string, unknown>)[key] ?? {};
    next[key] = { ...(base as object), ...(patch as object) };
  }
  return next as Messages;
}

/**
 * Editor configuration that is non-i18n but should still be available through
 * a single context to inner components — primarily the SME/developer split.
 */
export interface EditorConfig {
  /**
   * When true, surfaces developer-oriented affordances such as the inspector's
   * raw JSON tab. Defaults to false so the editor reads as a business-user tool
   * unless the host opts in.
   */
  developerMode: boolean;
}

export const EditorConfigContext = createContext<EditorConfig>({ developerMode: false });

export function useEditorConfig(): EditorConfig {
  return useContext(EditorConfigContext);
}
