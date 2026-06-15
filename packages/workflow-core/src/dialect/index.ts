import { cyoda07Dialect } from "./cyoda-0_7.js";
import { registerDialect } from "./registry.js";

// Register the shipped dialect(s) on module load.
registerDialect(cyoda07Dialect);

export type { CyodaDialect } from "./dialect.js";
export {
  LATEST_CYODA_VERSION,
  SUPPORTED_CYODA_VERSIONS,
  type CyodaSchemaVersion,
} from "./version.js";
export { getDialect, listDialects, registerDialect } from "./registry.js";
