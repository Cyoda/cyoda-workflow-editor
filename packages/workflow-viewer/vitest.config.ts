import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@cyoda/workflow-graph": new URL("../workflow-graph/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
  },
});
