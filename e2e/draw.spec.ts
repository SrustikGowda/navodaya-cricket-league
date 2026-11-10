import { expect, test, type Page } from "@playwright/test";

const DRAW_PASSWORD = "e2e-draw-password";

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the format diagram explains the tournament without overflowing", async ({ page }) => {
  await page.goto("/2026/fixtures");
  await expect(page.getByRole("heading", { name: "Fixtures", exact: true })).toBeVisible();
  const flow = page.getByRole("list", { name: "Tournament flow" });
  for (const text of ["18", "Teams", "3", "Groups", "8", "Qualify", "Quarterfinals", "Semifinals", "Final"]) {
    await expect(flow.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "TRIAL RUN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "REAL RUN" })).toBeVisible();
  await noOverflow(page);
});

test("a trial run plays the whole draw, is marked as unofficial, repeats, and writes nothing", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/2026/fixtures");
  await page.getByRole("button", { name: "TRIAL RUN" }).click();
  const stage = page.getByRole("dialog", { name: /trial draw/i });
  await expect(stage).toBeVisible();
  await expect(stage.getByText("TRIAL DRAW — NOT OFFICIAL")).toBeVisible();
  await expect(stage.getByText("/ 18 teams assigned")).toBeVisible();
  await stage.getByRole("button", { name: "Skip animation" }).click();
  await expect(stage.getByText("TRIAL COMPLETE — NOT OFFICIAL")).toBeVisible();
  // Seeded rules are visible in the result: champion and runner-up in different groups, Group C holds both other semifinalists.
  const group = (letter: string) => stage.getByRole("region", { name: `Group ${letter}` });
  await expect(group("C").getByText(/Jnv Junglees/)).toBeVisible();
  await expect(group("C").getByText(/Balehonnur Bulls/)).toBeVisible();
  const champion = [await group("A").getByText(/4s-11/).count(), await group("B").getByText(/4s-11/).count()];
  const runnerUp = [await group("A").getByText("RCB United").count(), await group("B").getByText("RCB United").count()];
  expect(champion[0] + champion[1]).toBe(1);
  expect(runnerUp[0] + runnerUp[1]).toBe(1);
  expect(champion[0]).not.toBe(runnerUp[0]);

  await stage.getByRole("button", { name: "See trial fixtures" }).click();
  await expect(page.getByText("TRIAL / DEMO — NOT OFFICIAL.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to format" })).toBeVisible();
  await page.getByRole("tab", { name: "All matches" }).click();
  await expect(page.locator(".dr-views--trial .dr-match")).toHaveCount(34);
  await noOverflow(page);

  await page.getByRole("button", { name: "Try again" }).first().click();
  await expect(page.getByRole("dialog", { name: /trial draw/i })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to format" }).click();

  expect(writes.every((entry) => entry === "POST /api/draw/trial")).toBe(true);
  const official = await page.request.get("/api/draw/official");
  expect((await official.json()).official).toBeNull();
});

test("the real run needs an organizer, the right password and a confirmation", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The one-time official draw is run once, on desktop.");
  await page.goto("/2026/fixtures");

  // A visitor who is not signed in is sent to organizer sign-in, and cannot call the API either.
  await page.getByRole("button", { name: "REAL RUN" }).click();
  await expect(page.getByText("can only be started by a signed-in organizer")).toBeVisible();
  const anonymous = await page.request.post("/api/draw/real", { data: { password: DRAW_PASSWORD, requestId: "anonymous-attempt-1" } });
  expect(anonymous.status()).toBe(401);
  await page.keyboard.press("Escape");

  // A second viewer is already watching when the draw is published.
  const watcher = await browser.newContext();
  const watching = await watcher.newPage();
  await watching.goto("http://127.0.0.1:3458/2026/fixtures");

  expect((await page.request.post("/api/admin/password", { data: { password: "playwright-admin" } })).status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "REAL RUN" }).click();
  await page.getByLabel("Draw password").fill("not-the-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That draw password is not correct.")).toBeVisible();
  expect((await (await page.request.get("/api/draw/official")).json()).official).toBeNull();

  await page.getByLabel("Draw password").fill(DRAW_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This will generate and publish the official NCL 2026 groups and fixtures. This action cannot be repeated without an organizer-authorized reset.")).toBeVisible();
  const publish = page.getByRole("button", { name: "Generate and publish the official draw" });
  await expect(publish).toBeDisabled();
  await page.getByRole("checkbox").check();
  await publish.click();

  const stage = page.getByRole("dialog", { name: /official group draw/i });
  await expect(stage).toBeVisible();
  // The viewer who did nothing gets the same official reveal started for them.
  await expect(watching.getByRole("dialog", { name: /official group draw/i })).toBeVisible({ timeout: 20_000 });

  await stage.getByRole("button", { name: "Skip animation" }).click();
  await expect(stage.getByText("OFFICIAL FIXTURES GENERATED", { exact: true })).toBeVisible();
  await stage.getByRole("button", { name: "View fixtures" }).click();

  const banner = page.locator(".dr-banner--official");
  await expect(banner).toContainText(/NCL26-[A-Z2-9]{6}/);
  const ref = (await banner.locator("b").first().innerText()).trim();
  await expect(page.getByRole("button", { name: "REAL RUN · done" })).toBeDisabled();

  // The opening match: defending champion, Saturday 7:30 AM, Ground A.
  await page.getByRole("tab", { name: "Saturday" }).click();
  const opener = page.locator('.dr-match[data-code="M01"]');
  await expect(opener).toContainText("7:30 AM");
  await expect(opener).toContainText("Ground A");
  await expect(opener).toContainText("4s-11");
  await page.getByRole("tab", { name: "All matches" }).click();
  await expect(page.locator(".dr-views--trial")).toHaveCount(0);
  await expect(page.locator(".dr-match")).toHaveCount(34);

  // Reload and a fresh visitor see the same draw; nothing is written. Replaying never calls the server.
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.reload();
  // Within a minute of publication a reload rejoins the shared reveal in progress; close it to look at the page.
  await page.waitForTimeout(800);
  const rejoined = page.getByRole("dialog", { name: /official group draw/i });
  if (await rejoined.isVisible()) await rejoined.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".dr-banner--official")).toContainText(ref);
  const fresh = await browser.newContext();
  const visitor = await fresh.newPage();
  await visitor.goto("http://127.0.0.1:3458/2026/fixtures");
  // Opened after the live window, so the reveal is not forced on a late visitor.
  await expect(visitor.locator(".dr-banner--official, .dr-stage").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Replay reveal" }).first().click();
  const replay = page.getByRole("dialog", { name: /official group draw/i });
  await expect(replay).toBeVisible();
  await replay.getByRole("button", { name: "Skip animation" }).click();
  await expect(replay.getByText("OFFICIAL DRAW · REPLAY", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "View fixtures" }).click();
  expect(writes).toEqual([]);
  await expect(page.locator(".dr-banner--official")).toContainText(ref);

  // The API refuses another draw, whoever asks.
  const again = await page.request.post("/api/draw/real", { data: { password: DRAW_PASSWORD, requestId: "second-attempt-0001" } });
  expect(again.status()).toBe(409);
  expect((await (await page.request.get("/api/draw/official")).json()).official.ref).toBe(ref);

  // Tapping a team shows its three matches, and the address is shareable.
  await page.getByRole("tab", { name: "By team" }).click();
  await expect(page.locator(".dr-team .dr-match")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share image" })).toBeVisible();
  await expect(page).toHaveURL(/team=/);
  // A clean image for WhatsApp.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save image" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ncl-2026-.*\.png$/);
  const path = await download.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path).size).toBeGreaterThan(20_000);

  await watcher.close();
  await fresh.close();
});

test("the draw respects reduced motion and still finishes", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Checked once, on the phone layout.");
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3458/2026/fixtures");
  await page.getByRole("button", { name: "TRIAL RUN" }).click();
  const stage = page.getByRole("dialog", { name: /trial draw/i });
  await expect(stage).toHaveClass(/dr-reduced/);
  await expect(stage.getByText("TRIAL COMPLETE — NOT OFFICIAL")).toBeVisible({ timeout: 40_000 });
  await context.close();
});
