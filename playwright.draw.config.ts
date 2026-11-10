import { defineConfig, devices } from "@playwright/test";

// Browser journeys for the group draw. Runs against its own embedded database seeded with 18 sample teams and a
// test-only draw password, so it never touches the main e2e database.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/draw.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3458" },
  webServer: {
    command: "rm -rf .data/pglite-e2e-draw && npx tsx scripts/seed-roster.ts && npm run dev -- --port 3458",
    url: "http://127.0.0.1:3458/api/health",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ALLOW_LOCAL_AUTH: "true",
      SESSION_SECRET: "playwright-session-secret",
      ADMIN_PASSWORD: "playwright-admin",
      ADMIN_EMAILS: "organizer@ncl.test",
      NCL_FIXTURE_RUN_PASSWORD: "e2e-draw-password",
      DEMO_MODE: "false",
      PGLITE_DIR: ".data/pglite-e2e-draw",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3458",
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
