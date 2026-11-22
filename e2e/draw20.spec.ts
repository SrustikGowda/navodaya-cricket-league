import { expect, test, type Page } from "@playwright/test";

// Run with E2E_TEAMS=20 (20 approved sample teams): npx playwright test -c playwright.draw.config.ts --trace off
test.skip(process.env.E2E_TEAMS !== "20", "Needs 20 approved sample teams. Run with E2E_TEAMS=20.");

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("with 20 approved teams the page explains two groups of ten with no BYE, and the trial draw makes 30 league matches", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname !== "/api/track") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/2026/fixtures");
  // The format and the explainer follow the number of approved teams.
  const format = page.locator(".tf").first();
  await expect(format).toContainText("20");
  await expect(format).toContainText("There is no BYE.");
  await expect(format).not.toContainText("+ 1 BYE");
  const how = page.locator(".dr-how");
  await expect(how.locator(".dr-how-card").nth(0)).toContainText("10 teams · 15 matches");
  await expect(how.locator(".dr-how-card").nth(1)).toContainText("10 teams · 15 matches");
  await expect(how.locator(".gw").nth(0).locator(".gw-node")).toHaveCount(10);
  await expect(how.locator(".gw").nth(1).locator(".gw-node")).toHaveCount(10);
  await expect(how.locator(".gw").nth(0).locator(".gw-edge")).toHaveCount(15);
  await expect(how.locator(".gw").nth(1).locator(".gw-edge")).toHaveCount(15);
  await expect(how.getByText(/BYE/)).toHaveCount(0);
  await expect(how).toContainText("10 teams play two of their three on Ground A and 10 play two on Ground B");
  await how.locator(".gw-node").filter({ hasText: /^A10$/ }).click();
  await expect(how.getByText(/^A10 plays A1, A5 and A9\. /)).toBeVisible();

  // A trial run uses the 20 approved teams: no BYE step, 20 teams assigned.
  await page.getByRole("button", { name: "TRIAL RUN" }).click();
  const stage = page.getByRole("dialog", { name: /trial run/i });
  await expect(stage.getByText("/ 20 teams assigned")).toBeVisible();
  await expect(stage.locator(".dr-opening-meta")).toContainText("20 teams · 2 groups");
  await stage.getByRole("button", { name: "Start reveal" }).click();
  await stage.getByRole("button", { name: "Skip animation" }).click();
  await expect(stage.getByText("TRIAL COMPLETE — NOT OFFICIAL")).toBeVisible();
  await expect(stage.locator('[data-slot^="A"]')).toHaveCount(10);
  await expect(stage.locator('[data-slot^="B"]')).toHaveCount(10);
  await expect(stage.getByText("BYE", { exact: true })).toHaveCount(0);
  const inA = async (name: RegExp) => (await stage.getByRole("region", { name: "Group A" }).getByText(name).count()) > 0;
  expect(await inA(/4s-11/)).not.toBe(await inA(/RCB United/));
  expect(await inA(/Jnv Junglees/)).not.toBe(await inA(/Balehonnur Bulls/));

  await stage.getByRole("button", { name: "See trial fixtures" }).click();
  const views = page.locator(".dr-views--trial");
  await expect(views.locator(".gc")).toHaveCount(2);
  await expect(views.locator(".gc-bye")).toHaveText(["Every team plays 3 matches", "Every team plays 3 matches"]);
  await expect(views.locator(".gc li")).toHaveCount(20);
  await expect(views.locator(".gc li .dr-bye-pill")).toHaveCount(0);
  const tiles = views.locator(".gc .dr-gt");
  await expect(tiles).toHaveCount(20);
  await expect(views.locator(".gc .dr-gt:has(i.is-a + i.is-a)")).toHaveCount(10);
  // 22 matches on Saturday (eleven slots), 15 on Sunday (8 league matches and 7 knockouts): 37 in all.
  await views.getByRole("tab", { name: "Day 1 · Saturday" }).click();
  await expect(views.locator(".dr-match")).toHaveCount(22);
  await expect(views.locator(".dr-grid-break")).toContainText("Inauguration break · 11:35 AM to 12:00 PM");
  await views.getByRole("tab", { name: "Day 2 · Sunday" }).click();
  await expect(views.locator(".dr-match")).toHaveCount(15);
  await views.getByRole("tab", { name: "Group A" }).click();
  await expect(views.locator(".gp .dr-match")).toHaveCount(15);
  await views.getByRole("tab", { name: "Group B" }).click();
  await expect(views.locator(".gp .dr-match")).toHaveCount(15);
  await views.getByRole("tab", { name: "My team" }).click();
  await expect(views.locator(".dr-team article.dr-match")).toHaveCount(3);
  await expect(views.locator(".dr-team-head")).not.toContainText("BYE");
  await expect(views.locator(".dr-rules")).toContainText("Points, qualification");
  await expect(views.locator(".dr-rules summary")).not.toContainText("BYE");
  await noOverflow(page);
  expect(writes.every((entry) => entry === "POST /api/draw/trial")).toBe(true);

  // The rules page describes the same format.
  await page.goto("/2026/rules");
  await expect(page.locator("#format")).toContainText("The 20 teams are drawn into two groups of 10.");
  await expect(page.locator("#format")).toContainText("37 matches are played in all: 30 league matches (15 in Group A and 15 in Group B)");
  await expect(page.getByText(/\bBYE\b/)).toHaveCount(0);
  await noOverflow(page);
});
