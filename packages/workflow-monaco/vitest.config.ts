import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    // `*.test-d.ts` files assert, at compile time, that the real
    // `monaco-editor` module satisfies the structural types this package
    // accepts. tsconfig.test-d.json includes tests/ so the check is real (the
    // package tsconfig excludes them).
    typecheck: {
      enabled: true,
      include: ["tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.test-d.json",
    },
  },
});
