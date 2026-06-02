import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@cyoda/workflow-viewer/theme": fileURLToPath(
        new URL("../../packages/workflow-viewer/src/theme/index.ts", import.meta.url),
      ),
      "@cyoda/workflow-viewer": fileURLToPath(
        new URL("../../packages/workflow-viewer/src/index.ts", import.meta.url),
      ),
      "@cyoda/workflow-react": fileURLToPath(
        new URL("../../packages/workflow-react/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
