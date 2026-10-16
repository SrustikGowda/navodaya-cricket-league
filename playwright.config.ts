import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3456" },
  webServer: {
    command: "npm run dev -- --port 3456",
    url: "http://127.0.0.1:3456/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ALLOW_LOCAL_AUTH: "true",
      SESSION_SECRET: "playwright-session-secret",
      ADMIN_PASSWORD: "playwright-admin",
      ADMIN_EMAILS: "organizer@ncl.test",
      DEMO_MODE: "false",
      PGLITE_DIR: ".data/pglite-e2e",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3456",
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
