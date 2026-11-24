import { defineConfig, devices } from "@playwright/test";

/**
 * Release smoke suite (tests/smoke): every demo route, viewer drag, the local
 * file editor (open / migrate / save), Monaco schema validation, the
 * criterion JSON editor and WorkflowEditor's inspect mode — in Chromium,
 * Firefox and WebKit.
 *
 *   pnpm test:smoke                        # all three browsers
 *   pnpm test:smoke --project=firefox      # one browser
 *   DEMO_PORT=5273 pnpm test:smoke         # if 5173 is taken (SMOKE_PORT also works)
 *   CYODA_URL=http://localhost:8080/api pnpm test:smoke
 *       # also import saved files into a running cyoda-go (needs a locked
 *       # model `probe`/1); those tests are skipped without CYODA_URL.
 */
const port = Number(process.env.DEMO_PORT ?? process.env.SMOKE_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 60_000,
  use: { baseURL, viewport },
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
  ],
});
