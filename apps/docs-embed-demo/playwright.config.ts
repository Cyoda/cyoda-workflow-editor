import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright visual regression harness (spec §22.4).
 * Baselines are checked in under `tests/visual/*.spec.ts-snapshots/`.
 * Regenerate with `pnpm visual:update` after an intentional visual change.
 */
// DEMO_PORT overrides the dev-server port (default 5173).
const port = Number(process.env.DEMO_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/visual",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      // Keep the sticky demo header from overlaying captured components.
      stylePath: "./tests/visual/screenshot.css",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
