import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787";

/**
 * Dedicated config for regenerating the README screenshots.
 *
 * It reuses the deterministic E2E server but only runs the setup project and
 * the screenshot capture spec. Normal `pnpm test:e2e` runs ignore this file.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1360, height: 880 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\.spec\.ts/,
    },
    {
      name: "screenshots",
      testMatch: /screenshots\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel: "chromium", storageState: "e2e/.auth/admin.json" },
    },
  ],
});
