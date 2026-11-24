/**
 * A cyoda-go schema dialect identifier. Open `string` (not a closed union) to
 * mirror the `migrate/registry.ts` keying and allow host apps to register
 * dialects for versions this library does not ship. Current shipped value:
 * `"0.9"`. The `"0.7"` dialect was removed in the 0.8.3 release and `"0.8"` in
 * the cyoda-go 0.9.0 release — see `ai/cyoda-schema-versions.md`.
 */
export type CyodaSchemaVersion = string;

/** The latest cyoda-go schema dialect this library ships. */
export const LATEST_CYODA_VERSION: CyodaSchemaVersion = "0.9";

/** Dialects shipped by this library (host apps may register more at runtime). */
export const SUPPORTED_CYODA_VERSIONS: readonly CyodaSchemaVersion[] = ["0.9"];
