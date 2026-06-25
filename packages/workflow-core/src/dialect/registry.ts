import type { CyodaDialect } from "./dialect.js";
import type { CyodaSchemaVersion } from "./version.js";

const registry = new Map<CyodaSchemaVersion, CyodaDialect>();

/**
 * Register (or replace) the dialect for a cyoda-go schema version. Host apps
 * can call this to support versions this library does not ship.
 */
export function registerDialect(dialect: CyodaDialect): void {
  registry.set(dialect.version, dialect);
}

/** Resolve a dialect, throwing a clear error if the version is unregistered. */
export function getDialect(version: CyodaSchemaVersion): CyodaDialect {
  const dialect = registry.get(version);
  if (!dialect) {
    const supported = [...registry.keys()].map((v) => `"${v}"`).join(", ") || "(none)";
    throw new Error(
      `Unknown cyoda-go schema version "${version}"; registered dialects: ${supported}.`,
    );
  }
  return dialect;
}

/** List the versions of all currently registered dialects. */
export function listDialects(): readonly CyodaSchemaVersion[] {
  return [...registry.keys()];
}
