import type { JsonLanguageDefaults, MonacoLike } from "./types.js";

/**
 * The JSON language service defaults of a Monaco instance, wherever this
 * monaco-editor version keeps them: the top-level `json` namespace (0.55+,
 * the only location from 0.56) or the legacy `languages.json` (before 0.56).
 * Throws a descriptive error when the instance exposes neither — typically a
 * custom monaco bundle without the JSON language feature.
 */
export function jsonDefaultsOf(monaco: MonacoLike): JsonLanguageDefaults {
  const legacy = monaco.languages?.json;
  const defaults =
    monaco.json?.jsonDefaults ?? (legacy && "jsonDefaults" in legacy ? legacy.jsonDefaults : undefined);
  if (!defaults) {
    throw new Error(
      "@cyoda/workflow-monaco: this Monaco instance has no JSON language defaults " +
        "(neither monaco.json.jsonDefaults nor monaco.languages.json.jsonDefaults). " +
        "Load monaco-editor's JSON language feature, e.g. the full `monaco-editor` entry " +
        "or `monaco-editor/languages/features/json/register`.",
    );
  }
  return defaults;
}
