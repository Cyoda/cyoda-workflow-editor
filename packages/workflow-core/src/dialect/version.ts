/**
 * A cyoda-go schema dialect identifier. Open `string` (not a closed union) to
 * mirror the `migrate/registry.ts` keying and allow host apps to register
 * dialects for versions this library does not ship. Current shipped values:
 * `"0.7"` and `"0.8"`. See `ai/cyoda-schema-versions.md` for how to add a new version.
 */
export type CyodaSchemaVersion = string;

/** The latest cyoda-go schema dialect this library ships. */
export const LATEST_CYODA_VERSION: CyodaSchemaVersion = "0.8";

/** Dialects shipped by this library (host apps may register more at runtime). */
export const SUPPORTED_CYODA_VERSIONS: readonly CyodaSchemaVersion[] = ["0.7", "0.8"];
