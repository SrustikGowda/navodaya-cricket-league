import { expect, test, type Page } from "@playwright/test";

const DRAW_PASSWORD = "e2e-draw-password";

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the tournament format picture is shown, opens full size, and does not overflow", async ({ page }) => {
  await page.goto("/2026/fixtures");
  await expect(page.getByRole("heading", { name: "Fixtures", exact: true })).toBeVisible();
  const picture = page.getByRole("img", { name: /NCL 2026 tournament format/ });
  await expect(picture).toBeVisible();
  // It really loaded, not a broken image.
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("link", { name: /full size/ })).toHaveAttribute("href", "/brand/ncl-2026-format-v1.png");
  expect((await page.request.get("/brand/ncl-2026-format-v1.png")).status()).toBe(200);
  // The words behind the picture are available too.
  await expect(picture).toHaveAttribute("alt", /27 league matches plus 7 knockouts make 34 matches/);
  await expect(page.getByText("Points and tie-breakers")).toBeVisible();
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
  await page.getByRole("button", { name: "Both days" }).click();
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

  const status = page.locator(".dr-status");
  await expect(status).toContainText(/NCL26-[A-Z2-9]{6}/);
  const ref = (await status.locator(".dr-status-ref").innerText()).trim();
  // Once published there is no Real Run button at all, only the status and a replay.
  await expect(page.getByRole("button", { name: "REAL RUN" })).toHaveCount(0);

  // The opening match: defending champion, Saturday 7:30 AM, Ground A.
  await expect(page.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
  const opener = page.locator('.dr-match[data-code="M01"]');
  await expect(opener).toHaveAttribute("aria-label", /Saturday 7:30 AM, Ground A/);
  await expect(opener).toContainText("4s-11");
  await expect(page.locator(".dr-row", { has: opener })).toContainText("7:30 AM");
  await page.getByRole("button", { name: "Both days" }).click();
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
  await expect(page.locator(".dr-status")).toContainText(ref);
  const fresh = await browser.newContext();
  const visitor = await fresh.newPage();
  await visitor.goto("http://127.0.0.1:3458/2026/fixtures");
  // Opened after the live window, so the reveal is not forced on a late visitor.
  await expect(visitor.locator(".dr-status, .dr-stage").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Replay the draw" }).click();
  const replay = page.getByRole("dialog", { name: /official group draw/i });
  await expect(replay).toBeVisible();
  await replay.getByRole("button", { name: "Skip animation" }).click();
  await expect(replay.getByText("OFFICIAL DRAW · REPLAY", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "View fixtures" }).click();
  expect(writes).toEqual([]);
  await expect(page.locator(".dr-status")).toContainText(ref);

  // The API refuses another draw, whoever asks.
  const again = await page.request.post("/api/draw/real", { data: { password: DRAW_PASSWORD, requestId: "second-attempt-0001" } });
  expect(again.status()).toBe(409);
  expect((await (await page.request.get("/api/draw/official")).json()).official.ref).toBe(ref);

  // Tapping a team shows its three matches, and the address is shareable.
  await page.getByRole("tab", { name: "Teams" }).click();
  await expect(page.locator(".dr-team .dr-match")).toHaveCount(3);
  // Teams are listed oldest batch first, not alphabetically.
  const picker = page.getByLabel("Choose a team").locator("option");
  await expect(picker).toHaveCount(18);
  await expect(picker.first()).toHaveText("4s-11 (2004–2011)");
  await expect(picker.nth(1)).toHaveText("RCB United");
  await expect(picker.last()).toHaveText("Hemavathi Hawks");
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

test("an admin marks fees, picks the knockouts, enters awards, then deletes the run and redoes it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once, after the official draw.");
  expect((await page.request.post("/api/admin/password", { data: { password: "playwright-admin" } })).status()).toBe(200);

  // Entry fee: tick the team in Settings › Payments, and it shows on the public team card.
  await page.goto("/admin/settings");
  const payments = page.locator("#payments");
  await expect(payments.getByRole("checkbox")).toHaveCount(18);
  await expect(payments.locator(".pay-name").first()).toHaveText("4s-11 (2004–2011)");
  await expect(payments.locator(".pay-name").last()).toHaveText("Hemavathi Hawks");
  const tick = payments.getByRole("checkbox", { name: /^4s-11/ });
  await tick.check();
  await expect(payments.locator(".pay-row.is-paid")).toHaveCount(1);
  await expect(payments.locator(".set-count")).toContainText(/^1 of 16 paid/);
  await expect(payments.locator(".pay-row", { hasText: "No fee" })).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#payments").getByRole("checkbox", { name: /^4s-11/ })).toBeChecked();
  await page.goto("/2026/teams");
  await expect(page.locator(".tm-card .tm-paid")).toHaveCount(1);
  await expect(page.locator(".tm-card", { has: page.locator(".tm-paid") })).toContainText("4s-11");
  // Every other team says so too: 15 have not paid, and the 2 teams from 2021+ batches show "No fee".
  await expect(page.locator(".tm-card .tm-unpaid")).toHaveCount(15);
  await expect(page.locator(".tm-card .tm-unpaid").first()).toHaveText("Fee not paid");
  await expect(page.locator(".tm-card .tm-nofee")).toHaveCount(2);
  await expect(page.locator(".tm-card", { has: page.locator(".tm-nofee") })).toHaveCount(2);
  await expect(page.locator(".tm-card", { hasText: "Hemavathi Hawks" }).locator(".tm-nofee")).toHaveText("No fee");
  await page.goto("/2026/teams/hemavathi-hawks");
  await expect(page.locator(".tm-nofee")).toHaveText("No entry fee");
  await page.goto("/2026");
  await expect(page.locator(".bc-team .tm-paid")).toHaveCount(1);
  await expect(page.locator(".bc-team .tm-unpaid")).toHaveCount(3);

  // Knockouts: choose teams and winners for Sunday's matches. Winners fill the next round by themselves.
  await page.goto("/admin/draw");
  const pickList = page.locator("form", { hasText: "#28" }).first().locator("select").nth(0).locator("option");
  await expect(pickList.nth(1)).toHaveText("4s-11 (2004–2011)");
  await expect(pickList.last()).toHaveText("Hemavathi Hawks");
  const save = async (match: string, teamA: string, teamB: string, winner: string | null) => {
    const form = page.locator("form", { hasText: match }).filter({ has: page.getByRole("button", { name: "Save" }) }).first();
    await form.locator("select").nth(0).selectOption({ label: teamA });
    await form.locator("select").nth(1).selectOption({ label: teamB });
    if (winner) await form.locator("select").nth(2).selectOption({ label: winner });
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Saved.")).toBeVisible();
  };
  await save("#28", "4s-11 (2004–2011)", "RCB United", "4s-11 (2004–2011)");
  await save("#29", "GTR", "The Elite", "GTR");
  await save("#30", "Champions-11", "IX-ELEVENS", "IX-ELEVENS");
  await save("#31", "Tunga Titans", "Malnad Mavericks", "Tunga Titans");
  await page.reload();
  const sf1 = page.locator("form", { hasText: "#32" }).first();
  await expect(sf1.locator("select").nth(0)).toHaveValue(/.+/);
  await expect(sf1.locator("select").nth(1)).toHaveValue(/.+/);
  await save("#32", "4s-11 (2004–2011)", "GTR", "4s-11 (2004–2011)");
  await save("#33", "IX-ELEVENS", "Tunga Titans", "Tunga Titans");
  await page.goto("/history");
  await expect(page.getByRole("tab", { name: /2026/ })).toHaveCount(0);
  await page.goto("/admin/draw");
  await save("#34", "4s-11 (2004–2011)", "Tunga Titans", "Tunga Titans");

  // The History page now has the edition, with no extra step.
  await page.goto("/history?year=2026");
  await expect(page.getByRole("tab", { name: /2026/ })).toBeVisible();
  await expect(page.locator(".hall-champion h2")).toHaveText("Tunga Titans");
  await expect(page.locator(".hall-runner")).toContainText("4s-11");

  // Awards typed in settings show up there as well.
  await page.goto("/admin/settings");
  const awards = page.locator("#awards");
  await awards.getByLabel("Best batter: player").fill("Praveen G J");
  await awards.getByLabel("Best batter: team").fill("GTR");
  await awards.getByLabel("Best batter: runs").fill("122");
  await awards.getByRole("button", { name: "Save awards" }).click();
  await expect(awards.getByText("Saved.")).toBeVisible();
  await page.goto("/history?year=2026");
  await expect(page.locator(".hall-standouts")).toContainText("Praveen G J");

  // Deleting the run is an admin action in settings: the draw password and the typed phrase.
  await page.goto("/admin/settings");
  const run = page.locator("#official-run");
  await run.locator("summary").click();
  await expect(run.getByText(/results come off the site/)).toBeVisible();
  await run.locator("input[name=password]").fill("e2e-draw-password");
  await run.locator("input[name=confirmation]").fill("WRONG PHRASE");
  await run.getByRole("button", { name: "Delete the official run" }).click();
  await expect(run.getByRole("alert")).toContainText("exactly");
  await run.locator("input[name=confirmation]").fill("DELETE NCL 2026 DRAW");
  await run.getByRole("button", { name: "Delete the official run" }).click();
  await expect(run.getByText(/was deleted/)).toBeVisible();

  // The History entry went with it, the Real Run is available again, and a new draw can be made.
  await page.goto("/history");
  await expect(page.getByRole("tab", { name: /2026/ })).toHaveCount(0);
  await page.goto("/2026/fixtures");
  await expect(page.getByRole("button", { name: "REAL RUN" })).toBeVisible();
  const redo = await page.request.post("/api/draw/real", { data: { password: "e2e-draw-password", requestId: "redo-after-delete-0001" } });
  expect(redo.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".dr-status")).toContainText(/NCL26-/);
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
