import { expect, test } from "@playwright/test";

test("public season is honest at the current viewport", async ({ page }, testInfo) => {
  await page.goto("/2026");
  await expect(page.getByRole("heading", { name: "Navodaya Cricket League" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Registration opens soon" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Captain Login" })).toHaveCount(0);
  await expect(page.getByText("Loyala School Ground").first()).toBeVisible();
  await expect(page.getByText("Organized by Alumni Batches 2005 & 2012").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sponsors" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  await page.goto("/2026/fixtures");
  await expect(page.getByRole("heading", { name: "Fixtures" })).toBeVisible();
  await expect(page.getByText("The 2026 schedule has not been published.")).toBeVisible();
  const fixturesOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(fixturesOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/fixtures-${testInfo.project.name}.png`, fullPage: true });

  await page.goto("/2026/register");
  await expect(page.getByRole("heading", { name: "Registration opens soon" })).toBeVisible();
  await expect(page.getByText("Team registration details will be announced here.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit registration" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/register-${testInfo.project.name}.png`, fullPage: true });
});

test("organizer password opens the dashboard and a captain cannot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Sign-in is checked once.");
  await page.goto("/admin/registrations");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Organizer sign-in" })).toBeVisible();
  const denied = await page.request.get("/api/admin/export/registrations");
  expect(denied.status()).toBe(401);

  await page.getByLabel("Password").fill("playwright-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrations", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/2026/);

  await page.goto("/captain/login");
  await page.getByLabel("Email").fill("captain@ncl.test");
  await page.getByRole("button", { name: "Continue on this device" }).click();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Organizer sign-in" })).toBeVisible();
  const captainExport = await page.request.get("/api/admin/export/registrations");
  expect(captainExport.status()).toBe(403);
});
