import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
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
  server: { port: 5173 },
});
