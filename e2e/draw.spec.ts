import { expect, test, type Page } from "@playwright/test";

const DRAW_PASSWORD = "e2e-draw-password";

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the 19-team, two-group format is shown, and nothing from the old format is", async ({ page }) => {
  await page.goto("/2026/fixtures");
  await expect(page.getByRole("heading", { name: "Fixtures", exact: true })).toBeVisible();
  const format = page.getByRole("figure", { name: /19 teams in two groups/ });
  await expect(format).toBeVisible();
  await expect(format).toContainText("Group A");
  await expect(format).toContainText("9 teams");
  await expect(format).toContainText("+ 1 BYE");
  await expect(format).toContainText("13 matches");
  await expect(format).toContainText("Group B");
  await expect(format).toContainText("10 teams");
  await expect(format).toContainText("15 matches");
  await expect(format).toContainText("8");
  await expect(format).toContainText("qualifiers");
  await expect(format).toContainText("Every team plays 3 league fixtures");
  await expect(page.getByRole("button", { name: "TRIAL RUN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "REAL RUN" })).toBeVisible();
  // How the fixtures work, shown with positions only: a ring of A1..A9 plus the BYE, and one of B1..B10.
  const how = page.locator(".dr-how");
  await how.scrollIntoViewIfNeeded();
  await expect(how.locator(".gw")).toHaveCount(2);
  await expect(how.locator(".gw").nth(0).locator(".gw-node")).toHaveCount(10);
  await expect(how.locator(".gw").nth(1).locator(".gw-node")).toHaveCount(10);
  await expect(how.locator(".gw").nth(0).locator(".gw-edge")).toHaveCount(14);
  await expect(how.locator(".gw").nth(1).locator(".gw-edge")).toHaveCount(15);
  await expect(how.getByText(/^A1 plays A2, A5 and A6\. A1 v A2 is the opening match\.$/)).toBeVisible();
  await how.locator(".gw-node").filter({ hasText: /^A9$/ }).click();
  await expect(how.getByText("A9 plays A4, A8 and a BYE.")).toBeVisible();
  await how.locator(".gw-node").filter({ hasText: /^B6$/ }).click();
  await expect(how.getByText("B6 plays B1, B5 and B7.")).toBeVisible();
  // No team names there: it explains the idea, it does not hint at the result.
  await expect(how.getByText(/4s-11|RCB United|Junglees/)).toHaveCount(0);
  // No trace of the old 18-team, three-group format, and no picture of it.
  await expect(page.getByText(/Group C|sub-pool|wildcard|third-placed|18 teams|34 (matches|fixtures)/i)).toHaveCount(0);
  await expect(page.locator('img[src*="format-v1"]')).toHaveCount(0);
  expect((await page.request.get("/brand/ncl-2026-format-v1.png")).status()).toBe(404);
  await noOverflow(page);
});

test("the rules page is complete, searchable, linked from the menu, and fits a phone", async ({ page }, testInfo) => {
  await page.goto("/2026/rules");
  await expect(page.getByRole("heading", { name: "Rules", exact: true })).toBeVisible();
  await expect(page.getByText("Tournament rules and guidelines")).toBeVisible();
  await expect(page.locator(".rb-sec")).toHaveCount(10);
  await expect(page.locator(".rb-rules > li")).toHaveCount(52);
  await expect(page.getByRole("heading", { name: "At a glance" })).toBeVisible();
  await expect(page.locator(".rb-glance li")).toHaveCount(8);
  await expect(page.locator("#points")).toContainText("QF1: Group A #1 v Group B #4");
  await expect(page.locator("#format")).toContainText("19 teams");
  await expect(page.getByText(/NCL 14|November 2025|Jagadeesh/)).toHaveCount(0);
  // Search narrows the rules and keeps their numbers.
  await page.getByRole("searchbox", { name: "Find a rule" }).fill("LBW");
  await expect(page.locator(".rb-rules > li")).toHaveCount(1);
  await expect(page.locator(".rb-rules > li")).toContainText("no LBW");
  await expect(page.locator(".rb-rules > li .rb-ref")).toHaveText("9.1");
  await expect(page.locator(".rb-count")).toContainText("1 match");
  await page.getByRole("button", { name: "Show all rules" }).click();
  await expect(page.locator(".rb-rules > li")).toHaveCount(52);
  await page.getByRole("searchbox", { name: "Find a rule" }).fill("zzzz");
  await expect(page.locator(".rb-count")).toContainText("No rule mentions");
  await page.getByRole("searchbox", { name: "Find a rule" }).fill("");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /Timing and penalties/ }).click();
  await expect(page).toHaveURL(/#timing$/);
  await expect(page.locator("#timing table").first()).toContainText("10 runs added to the opponent's score");
  await noOverflow(page);
  if (testInfo.project.name === "desktop") {
    await page.goto("/2026/fixtures");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Rules" }).click();
    await expect(page).toHaveURL(/\/2026\/rules$/);
  }
});

test("a trial run plays the whole draw, is marked as unofficial, repeats, and writes nothing", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    // The visit counter only touches the analytics table, never any draw or fixture data.
    if (request.method() !== "GET" && new URL(request.url()).pathname !== "/api/track") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.goto("/2026/fixtures");
  await page.getByRole("button", { name: "TRIAL RUN" }).click();
  const stage = page.getByRole("dialog", { name: /trial run/i });
  await expect(stage).toBeVisible();
  await expect(stage.getByText("TRIAL RUN — NOT OFFICIAL").first()).toBeVisible();
  await expect(stage.getByText("/ 19 teams assigned")).toBeVisible();
  // A trial belongs to one viewer: it waits to be started, however long that takes, and can be paused and stepped.
  await page.waitForTimeout(5000);
  await expect(stage.getByRole("button", { name: "Start reveal" })).toBeVisible();
  await expect(stage.getByRole("heading", { name: "NCL 2026" })).toBeVisible();
  await stage.getByRole("button", { name: "Start reveal" }).click();
  await expect(stage.getByRole("button", { name: "Pause" })).toBeVisible();
  await stage.getByRole("button", { name: "Next team" }).click();
  await expect(stage.getByRole("button", { name: "Replay" })).toBeVisible();
  await stage.getByRole("button", { name: "Pause" }).click();
  await expect(stage.getByRole("button", { name: "Auto play" })).toBeVisible();
  await stage.getByRole("button", { name: "Skip animation" }).click();
  await expect(stage.getByText("TRIAL COMPLETE — NOT OFFICIAL")).toBeVisible();

  // The seeded rules are visible in the result.
  const at = (code: string) => stage.locator(`[data-slot="${code}"]`);
  await expect(at("A1")).toContainText("4s-11");
  await expect(stage.getByRole("region", { name: "Group B" })).toContainText("RCB United");
  const inA = async (name: RegExp) => (await stage.getByRole("region", { name: "Group A" }).getByText(name).count()) > 0;
  expect(await inA(/Jnv Junglees/)).not.toBe(await inA(/Balehonnur Bulls/));
  await expect(stage.locator('[data-slot^="A"]')).toHaveCount(9);
  await expect(stage.locator('[data-slot^="B"]')).toHaveCount(10);
  await expect(at("A9")).toContainText("BYE");
  await expect(at("A9")).not.toContainText(/4s-11|RCB United|Jnv Junglees|Balehonnur Bulls/);
  await expect(stage.locator(".dr-boards-note")).toContainText("2 matches + 1 BYE");

  await stage.getByRole("button", { name: "See trial fixtures" }).click();
  await expect(page.getByText("TRIAL RUN — NOT OFFICIAL.")).toBeVisible();
  for (const name of ["Try again", "Replay reveal", "View groups", "View schedule", "Back to Fixtures"]) {
    await expect(page.getByRole("button", { name }).first()).toBeVisible();
  }
  const views = page.locator(".dr-views--trial");
  await expect(views.locator(".gc")).toHaveCount(2);
  await expect(views.locator(".gc-bye").first()).toContainText("2 matches + 1 BYE");
  // 20 matches on Saturday, 15 on Sunday (8 league and 7 knockouts): 35 in all.
  await views.getByRole("tab", { name: "Day 1 · Saturday" }).click();
  await expect(views.locator(".dr-match")).toHaveCount(20);
  await expect(views.locator(".dr-grid-break")).toContainText("Inauguration break");
  await views.getByRole("tab", { name: "Day 2 · Sunday" }).click();
  await expect(views.locator(".dr-match")).toHaveCount(15);
  await expect(views.locator(".dr-cell-reserved")).toHaveText("Reserved");
  await views.getByRole("tab", { name: "Group A" }).click();
  await expect(views.locator(".gp .dr-match")).toHaveCount(13);
  await views.getByRole("tab", { name: "Group B" }).click();
  await expect(views.locator(".gp .dr-match")).toHaveCount(15);
  await views.getByRole("tab", { name: "Knockouts" }).click();
  await expect(views.locator(".dr-bk-card:visible", { hasText: "Group A #1" }).first()).toBeVisible();
  await views.getByRole("tab", { name: "My team" }).click();
  await expect(views.locator(".dr-team article.dr-match")).toHaveCount(3);
  await noOverflow(page);

  await page.getByRole("button", { name: "Try again" }).first().click();
  await expect(page.getByRole("dialog", { name: /trial run/i })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to Fixtures" }).click();

  expect(writes.every((entry) => entry === "POST /api/draw/trial")).toBe(true);
  const official = await page.request.get("/api/draw/official");
  expect((await official.json()).official).toBeNull();
});

test("the real run needs an organizer, the right password and a confirmation", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The one-time official draw is run once, on desktop.");
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
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
  await expect(page.getByText("This will permanently generate and publish the official NCL 2026 groups and fixtures.")).toBeVisible();
  const publish = page.getByRole("button", { name: "Generate and publish the official draw" });
  await expect(publish).toBeDisabled();
  await page.getByRole("checkbox").check();
  await publish.click();

  const stage = page.getByRole("dialog", { name: /official group draw/i });
  await expect(stage).toBeVisible();
  // The viewer who did nothing gets the same official reveal started for them.
  await expect(watching.getByRole("dialog", { name: /official group draw/i })).toBeVisible({ timeout: 20_000 });

  await stage.getByRole("button", { name: "Skip animation" }).click();
  await expect(stage.getByText("OFFICIAL DRAW COMPLETED", { exact: true })).toBeVisible();
  await stage.getByRole("button", { name: "View fixtures" }).click();

  const status = page.locator(".dr-status");
  await expect(status).toContainText(/NCL26-[A-Z2-9]{6}/);
  const ref = (await status.locator(".dr-status-ref").innerText()).trim();
  // Once published there is no Real Run button at all, only the status and a replay.
  await expect(page.getByRole("button", { name: "REAL RUN" })).toHaveCount(0);

  // The opening match: defending champion at A1 against A2, Saturday 7:00 AM, Ground A.
  await expect(page.getByRole("tab", { name: "Day 1 · Saturday" })).toHaveAttribute("aria-selected", "true");
  const opener = page.locator('.dr-match[data-code="M01"]');
  await expect(opener).toHaveAttribute("aria-label", /Saturday 7:00 AM, Ground A/);
  await expect(opener).toContainText("4s-11");
  await expect(page.locator(".dr-row", { has: opener })).toContainText("7:00 AM");
  await expect(page.locator(".dr-views--trial")).toHaveCount(0);
  await expect(page.locator(".dr-match")).toHaveCount(20);
  await expect(page.locator(".dr-grid-break")).toContainText("Inauguration break · 11:35 AM to 12:30 PM");
  await page.getByRole("tab", { name: "Day 2 · Sunday" }).click();
  await expect(page.locator(".dr-match")).toHaveCount(15);
  await page.getByRole("tab", { name: "Day 1 · Saturday" }).click();

  // The groups: nine and ten teams, one BYE, and who has it.
  await expect(page.locator(".gc")).toHaveCount(2);
  await expect(page.locator(".gc").nth(0).locator("ol li")).toHaveCount(9);
  await expect(page.locator(".gc").nth(1).locator("ol li")).toHaveCount(10);
  await expect(page.locator(".gc li.is-bye")).toHaveCount(1);
  await expect(page.locator(".gc-bye").first()).toContainText("2 matches + 1 BYE");
  const byeTeam = (await page.locator(".gc li.is-bye .dr-team-btn").innerText()).trim();
  expect(["4s-11", "RCB United", "Jnv Junglees", "Balehonnur Bulls"]).not.toContain(byeTeam);
  await page.getByRole("tab", { name: "Group A" }).click();
  await expect(page.locator(".gp .dr-match")).toHaveCount(13);
  await expect(page.locator(".gp-opp li")).toHaveCount(9);
  await expect(page.locator(".gw")).toBeVisible();
  await page.getByRole("tab", { name: "Group B" }).click();
  await expect(page.locator(".gp .dr-match")).toHaveCount(15);
  await expect(page.locator(".gp-opp li")).toHaveCount(10);
  // The BYE team's list: two matches and the BYE, with no time or ground on the BYE.
  await page.locator(".gc li.is-bye .dr-team-btn").click();
  await expect(page.locator(".dr-team article.dr-match")).toHaveCount(3);
  await expect(page.locator(".dr-match--bye")).toContainText("BYE");
  await expect(page.locator(".dr-match--bye")).toContainText("walkover");
  await expect(page.locator(".dr-team-head")).toContainText("2 matches + 1 BYE");

  // The schedule can be downloaded as an image and as a PDF.
  const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG", exact: true }).click()]);
  expect(png.suggestedFilename()).toBe("ncl-2026-groups-and-fixtures.png");
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF", exact: true }).click()]);
  expect(pdf.suggestedFilename()).toBe("ncl-2026-groups-and-fixtures.pdf");
  const fs = await import("node:fs");
  expect(fs.statSync(await png.path()).size).toBeGreaterThan(60_000);
  const bytes = fs.readFileSync(await pdf.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.subarray(-6).toString()).toContain("%%EOF");
  expect(bytes.toString("latin1")).toContain("/Count 3");

  // Reload and a fresh visitor see the same draw; nothing is written. Replaying never calls the server.
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname !== "/api/track") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
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
  expect(writes, `browser problems: ${problems.join(" | ")}`).toEqual([]);
  await expect(page.locator(".dr-status")).toContainText(ref);

  // The API refuses another draw, whoever asks.
  const again = await page.request.post("/api/draw/real", { data: { password: DRAW_PASSWORD, requestId: "second-attempt-0001" } });
  expect(again.status()).toBe(409);
  expect((await (await page.request.get("/api/draw/official")).json()).official.ref).toBe(ref);

  // Tapping a team shows its three matches, and the address is shareable.
  await page.getByRole("tab", { name: "My team" }).click();
  await expect(page.locator(".dr-team article.dr-match")).toHaveCount(3);
  // Teams are listed oldest batch first, not alphabetically.
  const picker = page.getByLabel("Choose a team").locator("option");
  await expect(picker).toHaveCount(19);
  await expect(picker.first()).toHaveText("4s-11 (2004–2011)");
  await expect(picker.nth(1)).toHaveText("RCB United");
  await expect(picker.last()).toHaveText("Spartans XI");
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

  // Analytics: the visits and trial runs made by the earlier tests were counted. The organizer's own visits are not.
  const number = async (id: string) => Number(await page.locator(`.an-card[data-card="${id}"] strong`).innerText());
  await page.goto("/admin/analytics?range=all");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  const views = await number("views");
  expect(views).toBeGreaterThan(0);
  expect(await number("trial")).toBeGreaterThan(0);
  expect(await number("visitors")).toBeGreaterThan(0);
  await expect(page.locator("tr", { hasText: "/2026/fixtures" }).first()).toBeVisible();
  await expect(page.locator("tr[data-action=trial_run]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Last 7 days" })).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/range=today/);
  for (const path of ["/2026", "/2026/teams", "/2026/fixtures"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
  }
  await page.goto("/admin/analytics?range=all");
  expect(await number("views")).toBe(views);
  const track = await page.request.post("/api/track", { data: { type: "view", path: "/2026/rules", device: "desktop" }, headers: { origin: "http://127.0.0.1:3458" } });
  expect((await track.json()).counted).toBe(false);

  // Entry fee: tick the team in Settings › Payments, and it shows on the public team card.
  await page.goto("/admin/settings");
  const payments = page.locator("#payments");
  await expect(payments.getByRole("checkbox")).toHaveCount(19);
  await expect(payments.locator(".pay-name").first()).toHaveText("4s-11 (2004–2011)");
  await expect(payments.locator(".pay-name").last()).toHaveText("Spartans XI");
  const tick = payments.getByRole("checkbox", { name: /^4s-11/ });
  await tick.check();
  await expect(payments.locator(".pay-row.is-paid")).toHaveCount(1);
  await expect(payments.locator(".set-count")).toContainText(/^1 of 16 paid/);
  await expect(payments.locator(".pay-row", { hasText: "No fee" })).toHaveCount(3);
  await page.reload();
  await expect(page.locator("#payments").getByRole("checkbox", { name: /^4s-11/ })).toBeChecked();
  await page.goto("/2026/teams");
  await expect(page.locator(".tm-card .tm-paid")).toHaveCount(1);
  await expect(page.locator(".tm-card", { has: page.locator(".tm-paid") })).toContainText("4s-11");
  // Every other team says so too: 15 have not paid, and the 3 teams from 2021+ batches show "No fee".
  await expect(page.locator(".tm-card .tm-unpaid")).toHaveCount(15);
  await expect(page.locator(".tm-card .tm-unpaid").first()).toHaveText("Fee not paid");
  await expect(page.locator(".tm-card .tm-nofee")).toHaveCount(3);
  await expect(page.locator(".tm-card", { has: page.locator(".tm-nofee") })).toHaveCount(3);
  await expect(page.locator(".tm-card", { hasText: "Hemavathi Hawks" }).locator(".tm-nofee")).toHaveText("No fee");
  await page.goto("/2026/teams/hemavathi-hawks");
  await expect(page.locator(".tm-nofee")).toHaveText("No entry fee");
  await page.goto("/2026");
  await expect(page.locator(".bc-team .tm-paid")).toHaveCount(1);
  await expect(page.locator(".bc-team .tm-unpaid")).toHaveCount(3);

  // Knockouts: choose teams and winners for Sunday's matches. Winners fill the next round by themselves.
  await page.goto("/admin/draw");
  const pickList = page.locator("form", { hasText: "#29" }).first().locator("select").nth(0).locator("option");
  await expect(pickList.nth(1)).toHaveText("4s-11 (2004–2011)");
  await expect(pickList.last()).toHaveText("Spartans XI");

  // The final standings cannot be confirmed before every league result is in.
  await expect(page.locator("#confirm")).toContainText("Available once all 28 league matches have a result");

  // Match times: a change that breaks the rules cannot be applied; a good one is previewed, applied and shown publicly.
  const times = page.locator("#timetable");
  await times.locator('input[name="saturdayStart"]').fill("12:00");
  await times.getByRole("button", { name: "Preview the change" }).click();
  await expect(times.getByText("These times break the rules")).toBeVisible();
  await expect(times.getByRole("button", { name: /^Apply: move/ })).toHaveCount(0);
  await times.locator('input[name="saturdayStart"]').fill("07:30");
  await times.locator('input[name="note"]').fill("Start half an hour later");
  await times.getByRole("button", { name: "Preview the change" }).click();
  await expect(times.getByText(/matches would move/)).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await times.getByRole("button", { name: /^Apply: move/ }).click();
  await expect(times.getByText(/matches were moved/)).toBeVisible();
  await page.goto("/2026/fixtures");
  await expect(page.locator('.dr-match[data-code="M01"]')).toContainText("4s-11");
  await expect(page.locator(".dr-row", { has: page.locator('.dr-match[data-code="M01"]') })).toContainText("7:30 AM");
  await expect(page.locator('.dr-match[data-code="M01"] .dr-m-moved')).toHaveText("Rescheduled");
  await page.goto("/admin/draw");
  const save = async (match: string, teamA: string, teamB: string, winner: string | null) => {
    const form = page.locator("form", { hasText: match }).filter({ has: page.getByRole("button", { name: "Save" }) }).first();
    await form.locator("select").nth(0).selectOption({ label: teamA });
    await form.locator("select").nth(1).selectOption({ label: teamB });
    if (winner) await form.locator("select").nth(2).selectOption({ label: winner });
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Saved.")).toBeVisible();
  };
  await save("#29", "4s-11 (2004–2011)", "RCB United", "4s-11 (2004–2011)");
  await save("#30", "GTR", "The Elite", "GTR");
  await save("#31", "Champions-11", "IX-ELEVENS", "IX-ELEVENS");
  await save("#32", "Tunga Titans", "Malnad Mavericks", "Tunga Titans");
  await page.reload();
  const sf1 = page.locator("form", { hasText: "#33" }).first();
  await expect(sf1.locator("select").nth(0)).toHaveValue(/.+/);
  await expect(sf1.locator("select").nth(1)).toHaveValue(/.+/);
  await save("#33", "4s-11 (2004–2011)", "GTR", "4s-11 (2004–2011)");
  await save("#34", "IX-ELEVENS", "Tunga Titans", "Tunga Titans");
  await page.goto("/history");
  await expect(page.getByRole("tab", { name: /2026/ })).toHaveCount(0);
  await page.goto("/admin/draw");
  await save("#35", "4s-11 (2004–2011)", "Tunga Titans", "Tunga Titans");

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
  const stage = page.getByRole("dialog", { name: /trial run/i });
  await expect(stage).toHaveClass(/dr-reduced/);
  await stage.getByRole("button", { name: "Start reveal" }).click();
  await expect(stage.getByText("TRIAL COMPLETE — NOT OFFICIAL")).toBeVisible({ timeout: 60_000 });
  await context.close();
});
