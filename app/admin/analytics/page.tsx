import Link from "next/link";
import { getActor } from "@/lib/auth";
import { ACTIONS, analyticsSummary, drawPasswordFailures, parseRange, RANGES, type ActionName } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { getOfficialDraw } from "@/lib/draw/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const KNOWN: Record<string, string> = {
  "/": "Start page",
  "/2026": "Home",
  "/2026/fixtures": "Fixtures",
  "/2026/teams": "Teams",
  "/2026/standings": "Standings",
  "/2026/register": "Registration",
  "/2026/rules": "Rules",
  "/history": "History",
  "/privacy": "Privacy",
  "/captain": "Captain desk",
  "/captain/login": "Captain sign-in",
};

function label(path: string): string {
  if (KNOWN[path]) return KNOWN[path] as string;
  if (path.startsWith("/2026/teams/")) return `Team · ${path.slice("/2026/teams/".length)}`;
  if (path.startsWith("/2026/matches/")) return "Match page";
  return path;
}

const shortDate = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
};

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const range = parseRange((await searchParams).range);
  const db = await getDb();
  const [summary, failures, official] = await Promise.all([analyticsSummary(db, range), drawPasswordFailures(db, range), getOfficialDraw(db)]);
  const count = (name: ActionName) => summary.actions.find((action) => action.name === name)?.count ?? 0;
  const downloads = count("export_png") + count("export_pdf");
  const shares = count("team_image") + count("whatsapp");
  const phonePercent = summary.views > 0 ? Math.round((summary.phoneViews / summary.views) * 100) : 0;
  const peak = Math.max(1, ...summary.days.map((day) => day.views));
  const tabs = summary.actions.filter((action) => action.name.startsWith("tab_"));
  const doing = summary.actions.filter((action) => !action.name.startsWith("tab_"));

  const cards: { value: string; label: string; id: string }[] = [
    { id: "views", value: String(summary.views), label: "Page views" },
    { id: "visitors", value: String(summary.visitors), label: "Visitors" },
    { id: "trial", value: String(count("trial_run")), label: "Trial runs" },
    { id: "replay", value: String(count("replay")), label: "Reveal replays" },
    { id: "downloads", value: String(downloads), label: "Schedule downloads" },
    { id: "shares", value: String(shares), label: "Team image and WhatsApp shares" },
    { id: "phone", value: `${phonePercent}%`, label: "Views on phones" },
    { id: "wrong", value: String(failures), label: "Wrong draw passwords" },
  ];

  return (
    <div className="stack analytics">
      <div className="admin-heading">
        <h1>Analytics</h1>
        <p className="status-badge">{official ? `Official draw ${official.ref} is published` : "Official draw not run yet"}</p>
      </div>
      <nav className="an-range" aria-label="Time range">
        {RANGES.map((item) => (
          <Link key={item.id} href={`/admin/analytics?range=${item.id}`} aria-current={item.id === range ? "page" : undefined} className={item.id === range ? "is-active" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="dash-grid an-cards">
        {cards.map((card) => (
          <div key={card.id} className="dash-card an-card" data-card={card.id}>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>Page views per day</h2>
        {summary.views === 0 ? (
          <p className="quiet">Nothing counted yet in this range.</p>
        ) : (
          <ol className="an-bars" aria-label="Page views per day">
            {summary.days.map((day) => (
              <li key={day.date} title={`${shortDate(day.date)}: ${day.views} views, ${day.visitors} visitors`}>
                <b>{day.views}</b>
                <span className="an-bar" style={{ height: `${Math.max(day.views > 0 ? 4 : 0, Math.round((day.views / peak) * 100))}%` }} />
                <small>{shortDate(day.date)}</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="stack">
        <h2>Pages</h2>
        {summary.pages.length === 0 ? (
          <p className="quiet">No page has been opened yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Views</th>
                  <th>Visitors</th>
                </tr>
              </thead>
              <tbody>
                {summary.pages.map((page) => (
                  <tr key={page.path}>
                    <td>
                      {label(page.path)} <span className="quiet an-path">{page.path}</span>
                    </td>
                    <td>{page.views}</td>
                    <td>{page.visitors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack">
        <h2>What people did</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Times</th>
                <th>People</th>
              </tr>
            </thead>
            <tbody>
              {doing.map((action) => (
                <tr key={action.name} data-action={action.name}>
                  <td>{ACTIONS[action.name]}</td>
                  <td>{action.count}</td>
                  <td>{action.visitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>Fixtures tabs opened</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tab</th>
                <th>Times</th>
                <th>People</th>
              </tr>
            </thead>
            <tbody>
              {tabs.map((action) => (
                <tr key={action.name}>
                  <td>{action.label.replace("Fixtures tab: ", "")}</td>
                  <td>{action.count}</td>
                  <td>{action.visitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="quiet an-note">
        No address, name or account is stored. A visitor is an anonymous code that changes every day, so a person who comes on two days counts as two visitors. Your own visits while signed in as an organizer, and search-engine robots, are not counted. Visitors who turn on Do Not Track are not counted either.
      </p>
    </div>
  );
}
