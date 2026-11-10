"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderShareCard } from "@/lib/draw/share-image";
import type { Qualification } from "@/lib/draw/standings";
import type { DrawPlan, GroupCode, LiveFixture, PublicTeam } from "@/lib/draw/types";
import {
  buildViewMatches,
  DAY_LABEL,
  leagueMatchesOf,
  opponentOf,
  SEED_TEXT,
  slotCodeOf,
  slotOf,
  STAGE_LABEL,
  teamNames,
  timeText,
  type ViewMatch,
} from "@/lib/draw/view";
import { Bracket } from "./bracket";
import { MatchCard } from "./match-card";
import { StandingsBoard } from "./standings-board";
import { TeamMark } from "./team-mark";

type TabId = "schedule" | "groups" | "teams" | "bracket" | "standings";
type DayChoice = "1" | "2" | "both";

export type InitialView = { tab?: string; team?: string; day?: string; stage?: string; ground?: string; group?: string };

type Filters = { team: string; group: string; stage: string; ground: string };
const EMPTY: Filters = { team: "", group: "", stage: "", ground: "" };

const DATES: Record<1 | 2, string> = { 1: "28 November", 2: "29 November" };

function applyFilters(matches: ViewMatch[], f: Filters, day: DayChoice): ViewMatch[] {
  return matches.filter((m) => {
    if (day !== "both" && String(m.day) !== day) return false;
    if (f.team && m.a.teamId !== f.team && m.b.teamId !== f.team) return false;
    if (f.group === "KO" ? m.stage === "league" : f.group && m.group !== f.group) return false;
    if (f.stage && m.stage !== f.stage) return false;
    if (f.ground && m.ground !== f.ground) return false;
    return true;
  });
}

function startTab(initial: InitialView | undefined, official: boolean): TabId {
  const tab = initial?.tab;
  if (tab === "groups" || tab === "teams" || tab === "bracket" || (tab === "standings" && official)) return tab;
  if (!tab && initial?.team) return "teams";
  return "schedule";
}

function startDay(initial: InitialView | undefined): DayChoice {
  const value = initial?.day ?? initial?.tab;
  if (value === "2026-11-29" || value === "2" || value === "sunday") return "2";
  if (value === "both" || value === "all") return "both";
  return "1";
}

export function ScheduleViews({
  kind,
  plan,
  fixtures,
  qualification,
  teams,
  drawRef,
  initial,
}: {
  kind: "official" | "trial";
  plan: DrawPlan;
  fixtures?: LiveFixture[];
  qualification?: Qualification | null;
  teams: PublicTeam[];
  drawRef?: string | null;
  initial?: InitialView;
}) {
  const official = kind === "official";
  const matches = useMemo(() => buildViewMatches(plan, fixtures), [plan, fixtures]);
  const names = useMemo(() => teamNames(plan), [plan]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const orderedTeams = useMemo(() => [...plan.roster].sort((a, b) => a.name.localeCompare(b.name)), [plan]);

  const resolveTeam = useCallback(
    (value: string | undefined): string => {
      if (!value) return "";
      const lower = value.toLowerCase();
      const hit = plan.roster.find((team) => team.id === value || teamMap.get(team.id)?.slug === value || team.name.toLowerCase() === lower);
      return hit?.id ?? "";
    },
    [plan, teamMap],
  );

  // Phones get shorter labels so all five tabs fit without a hidden one off-screen.
  const tabs: { id: TabId; label: string; short: string }[] = [
    { id: "schedule", label: "Schedule", short: "Schedule" },
    { id: "groups", label: "Groups", short: "Groups" },
    { id: "teams", label: "Teams", short: "Teams" },
    { id: "bracket", label: "Knockouts", short: "Bracket" },
    ...(official ? [{ id: "standings" as const, label: "Standings", short: "Table" }] : []),
  ];
  const [tab, setTab] = useState<TabId>(startTab(initial, official));
  const [day, setDay] = useState<DayChoice>(startDay(initial));
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY,
    group: initial?.group ?? "",
    stage: initial?.stage ?? "",
    ground: initial?.ground ?? "",
  });
  const [moreFilters, setMoreFilters] = useState(Boolean(initial?.group || initial?.stage || initial?.ground));
  const [team, setTeam] = useState<string>(resolveTeam(initial?.team) || (orderedTeams[0]?.id ?? ""));
  const [group, setGroup] = useState<GroupCode>("A");
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the address shareable (official only): the open tab and team survive a copy-paste.
  useEffect(() => {
    if (!official) return;
    const url = new URL(window.location.href);
    for (const key of ["day", "stage", "ground", "group", "team", "tab"]) url.searchParams.delete(key);
    if (tab === "teams" && team) url.searchParams.set("team", teamMap.get(team)?.slug ?? team);
    else if (tab !== "schedule") url.searchParams.set("tab", tab);
    else if (day !== "1") url.searchParams.set("day", day === "2" ? "2026-11-29" : "both");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [official, tab, team, day, teamMap]);

  const openTeam = useCallback((teamId: string) => {
    setTeam(teamId);
    setTab("teams");
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const listed = useMemo(() => applyFilters(matches, filters, day), [matches, filters, day]);
  const extraCount = [filters.group, filters.stage, filters.ground].filter(Boolean).length;
  const set = (key: keyof Filters) => (event: React.ChangeEvent<HTMLSelectElement>) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className={official ? "dr-views" : "dr-views dr-views--trial"} ref={rootRef} id="dr-views" data-ref={drawRef ?? undefined}>
      <div className="dr-tabs" role="tablist" aria-label="Fixture views">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`dr-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="dr-panel"
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => setTab(item.id)}
            aria-label={item.label}
          >
            <span className="dr-tab-long">{item.label}</span>
            <span className="dr-tab-short" aria-hidden="true">
              {item.short}
            </span>
          </button>
        ))}
      </div>

      <div id="dr-panel" role="tabpanel" aria-labelledby={`dr-tab-${tab}`} className="dr-panel">
        {tab === "schedule" ? (
          <>
            <div className="dr-controls">
              <div className="dr-seg" role="group" aria-label="Day">
                {(
                  [
                    ["1", "Saturday", "28 Nov"],
                    ["2", "Sunday", "29 Nov"],
                    ["both", "Both days", ""],
                  ] as const
                ).map(([value, label, date]) => (
                  <button key={value} type="button" aria-pressed={day === value} className={day === value ? "is-active" : undefined} onClick={() => setDay(value)}>
                    {label}
                    {date ? <small>{date}</small> : null}
                  </button>
                ))}
              </div>
              <div className="dr-controls-right">
                <label className="dr-select">
                  <span className="dr-sr">Team</span>
                  <select value={filters.team} onChange={set("team")} aria-label="Show one team">
                    <option value="">All teams</option>
                    {orderedTeams.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className={extraCount ? "dr-chipbtn is-on" : "dr-chipbtn"} aria-expanded={moreFilters} aria-controls="dr-more-filters" onClick={() => setMoreFilters((value) => !value)}>
                  Filters{extraCount ? ` · ${extraCount}` : ""}
                </button>
              </div>
            </div>
            {moreFilters ? (
              <div className="dr-filters" id="dr-more-filters" role="group" aria-label="More filters">
                <label>
                  <span>Group</span>
                  <select value={filters.group} onChange={set("group")}>
                    <option value="">All groups</option>
                    <option value="A">Group A</option>
                    <option value="B">Group B</option>
                    <option value="C">Group C</option>
                    <option value="KO">Knockouts only</option>
                  </select>
                </label>
                <label>
                  <span>Stage</span>
                  <select value={filters.stage} onChange={set("stage")}>
                    <option value="">All stages</option>
                    {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABEL[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Ground</span>
                  <select value={filters.ground} onChange={set("ground")}>
                    <option value="">Both grounds</option>
                    <option value="A">Ground A</option>
                    <option value="B">Ground B</option>
                  </select>
                </label>
                {extraCount || filters.team ? (
                  <button type="button" className="dr-chipbtn" onClick={() => setFilters(EMPTY)}>
                    Clear all
                  </button>
                ) : null}
              </div>
            ) : null}
            <Timetable matches={listed} days={day === "both" ? [1, 2] : [Number(day) as 1 | 2]} onTeam={openTeam} highlightTeam={filters.team || null} linkable={official} />
          </>
        ) : null}
        {tab === "groups" ? <GroupsPanel plan={plan} matches={matches} names={names} teams={teamMap} group={group} setGroup={setGroup} onTeam={openTeam} linkable={official} /> : null}
        {tab === "teams" ? <TeamPanel kind={kind} plan={plan} matches={matches} teamId={team} setTeam={setTeam} orderedTeams={orderedTeams} teams={teamMap} drawRef={drawRef ?? null} onTeam={openTeam} /> : null}
        {tab === "bracket" ? <Bracket matches={matches} onTeam={official ? openTeam : undefined} /> : null}
        {tab === "standings" && official ? (
          qualification ? (
            <StandingsBoard qualification={qualification} names={names} teams={teamMap} onTeam={openTeam} />
          ) : (
            <p className="dr-empty">Standings appear after the first result.</p>
          )
        ) : null}
      </div>
    </div>
  );
}

/** A day as a real timetable: times down the side, Ground A and Ground B across. Phones stack the two grounds. */
function Timetable({ matches, days, onTeam, highlightTeam, linkable }: { matches: ViewMatch[]; days: (1 | 2)[]; onTeam: (teamId: string) => void; highlightTeam: string | null; linkable: boolean }) {
  if (matches.length === 0) return <p className="dr-empty">No matches fit that choice.</p>;
  return (
    <div className="dr-timetable">
      {days.map((day) => {
        const rows = matches.filter((m) => m.day === day);
        if (rows.length === 0) return null;
        const slots = [...new Set(rows.map((m) => m.startMinutes))].sort((a, b) => a - b);
        const league = rows.filter((m) => m.stage === "league").length;
        const meta =
          day === 1
            ? `${rows.length} ${rows.length === 1 ? "match" : "matches"} · 6 overs a side`
            : league === rows.length
              ? `${rows.length} league ${rows.length === 1 ? "match" : "matches"} · 6 overs a side`
              : `${rows.length} ${rows.length === 1 ? "match" : "matches"} · league and quarterfinals 6 overs, semifinals and final 8`;
        return (
          <section className="dr-day" key={day} aria-labelledby={`dr-day-${day}`}>
            <header className="dr-day-head">
              <h3 id={`dr-day-${day}`}>
                {DAY_LABEL[day]} <span>{DATES[day]}</span>
              </h3>
              <p>{meta}</p>
            </header>
            <div className="dr-grid">
              <div className="dr-grid-head" aria-hidden="true">
                <span />
                <span>Ground A</span>
                <span>Ground B</span>
              </div>
              {slots.map((minutes, index) => {
                const inSlot = rows.filter((m) => m.startMinutes === minutes);
                const knockout = inSlot.every((m) => m.stage !== "league");
                const previousKnockout = index > 0 && rows.filter((m) => m.startMinutes === slots[index - 1]).every((m) => m.stage !== "league");
                return (
                  <div key={minutes} className="dr-slotgroup">
                    {knockout && !previousKnockout ? <p className="dr-grid-divider">Knockouts</p> : null}
                    <div className={knockout ? "dr-row dr-row--ko" : "dr-row"}>
                      <time className="dr-row-time">{timeText(minutes)}</time>
                      {(["A", "B"] as const).map((ground) => {
                        const match = inSlot.find((m) => m.ground === ground);
                        return match ? (
                          <MatchCard key={match.code} match={match} onTeam={onTeam} highlightTeam={highlightTeam} linkable={linkable} />
                        ) : (
                          <div key={ground} className="dr-cell-empty" aria-hidden="true" />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GroupsPanel({
  plan,
  matches,
  names,
  teams,
  group,
  setGroup,
  onTeam,
  linkable,
}: {
  plan: DrawPlan;
  matches: ViewMatch[];
  names: Map<string, string>;
  teams: Map<string, PublicTeam>;
  group: GroupCode;
  setGroup: (group: GroupCode) => void;
  onTeam: (teamId: string) => void;
  linkable: boolean;
}) {
  const own = matches.filter((m) => m.stage === "league" && m.group === group).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return (
    <div className="dr-groups">
      <div className="dr-seg dr-gseg" role="group" aria-label="Group">
        {(["A", "B", "C"] as const).map((code) => (
          <button key={code} type="button" aria-pressed={group === code} className={group === code ? "is-active" : undefined} onClick={() => setGroup(code)}>
            Group {code}
          </button>
        ))}
      </div>
      <div className="dr-gcards">
        {(["A", "B", "C"] as const).map((code) => {
          const members = plan.result.assignments.filter((a) => a.group === code).sort((x, y) => x.slot - y.slot);
          return (
            <section key={code} className={group === code ? "dr-gcard is-active" : "dr-gcard"} aria-label={`Group ${code}`}>
              <header>
                <h4>Group {code}</h4>
                <button type="button" className="dr-chipbtn" aria-pressed={group === code} onClick={() => setGroup(code)}>
                  {group === code ? "Matches below" : "Show matches"}
                </button>
              </header>
              {([1, 2] as const).map((pool) => (
                <ul key={pool} className="dr-gpool" aria-label={`Sub-pool ${code}${pool}`}>
                  <li className="dr-gcard-pool">Sub-pool {code}{pool}</li>
                  {members
                    .filter((a) => a.subPool === pool)
                    .map((a) => {
                      const name = names.get(a.teamId) ?? a.teamId;
                      return (
                        <li key={a.teamId} className={a.seed ? "is-seed" : undefined}>
                          <i className="dr-slot-tag">{slotCodeOf(a)}</i>
                          <TeamMark name={name} logoUrl={teams.get(a.teamId)?.logoUrl} size={24} />
                          <button type="button" className="dr-team-btn" onClick={() => onTeam(a.teamId)}>
                            {name}
                          </button>
                          {a.seed ? (
                            <em className="dr-seed-dot" title={SEED_TEXT[a.seed]}>
                              {SEED_TEXT[a.seed]}
                            </em>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              ))}
            </section>
          );
        })}
      </div>
      <h4 className="dr-subtitle">
        Group {group} · {own.length} league matches
      </h4>
      <div className="dr-list">
        {own.map((match) => (
          <MatchCard key={match.code} match={match} onTeam={onTeam} linkable={linkable} showWhen />
        ))}
      </div>
    </div>
  );
}

function TeamPanel({
  kind,
  plan,
  matches,
  teamId,
  setTeam,
  orderedTeams,
  teams,
  drawRef,
  onTeam,
}: {
  kind: "official" | "trial";
  plan: DrawPlan;
  matches: ViewMatch[];
  teamId: string;
  setTeam: (id: string) => void;
  orderedTeams: { id: string; name: string }[];
  teams: Map<string, PublicTeam>;
  drawRef: string | null;
  onTeam: (teamId: string) => void;
}) {
  const official = kind === "official";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const assignment = slotOf(plan, teamId);
  const name = orderedTeams.find((item) => item.id === teamId)?.name ?? "";
  const own = leagueMatchesOf(matches, teamId);
  const info = teams.get(teamId);
  const link = () => {
    const url = new URL("/2026/fixtures", window.location.origin);
    url.searchParams.set("team", info?.slug ?? teamId);
    return url.toString();
  };
  const summary = () =>
    [
      `${name} — NCL 2026 fixtures${official ? "" : " (TRIAL — NOT OFFICIAL)"}`,
      ...own.map((m) => `${DAY_LABEL[m.day]} ${timeText(m.startMinutes)} · ${m.groundName} · vs ${opponentOf(m, teamId).label}`),
    ].join("\n");

  async function makeFile(): Promise<File> {
    const blob = await renderShareCard({
      teamName: name,
      groupLine: assignment ? `Group ${assignment.group} · Sub-pool ${assignment.group}${assignment.subPool} · ${slotCodeOf(assignment)}` : "",
      seedLine: assignment?.seed ? SEED_TEXT[assignment.seed] : null,
      matches: own.map((match) => {
        const other = opponentOf(match, teamId);
        return { match, opponent: other.label, opponentSlot: other.slot };
      }),
      official,
      drawRef,
      url: official ? link() : "Trial draw - not published",
    });
    return new File([blob], `ncl-2026-${(info?.slug ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, { type: "image/png" });
  }

  async function saveImage() {
    setBusy(true);
    setNote("");
    try {
      const file = await makeFile();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote("Image saved. Send it on WhatsApp from your gallery.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The image could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    setBusy(true);
    setNote("");
    try {
      const file = await makeFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${name} · NCL 2026`, text: official ? link() : "Trial draw - not official" });
      } else {
        await saveImage();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNote("Sharing was not possible. Save the image instead.");
    } finally {
      setBusy(false);
    }
  }

  if (!teamId || !assignment) return <p className="dr-empty">Choose a team.</p>;
  return (
    <div className="dr-team">
      <label className="dr-select dr-select--wide">
        <span className="dr-sr">Team</span>
        <select value={teamId} onChange={(event) => setTeam(event.target.value)} aria-label="Choose a team">
          {orderedTeams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <header className="dr-team-head">
        <TeamMark name={name} logoUrl={info?.logoUrl} size={52} />
        <div>
          <h3>{name}</h3>
          <p>
            Group {assignment.group} · Sub-pool {assignment.group}
            {assignment.subPool} · <b>{slotCodeOf(assignment)}</b>
            {assignment.seed ? <span className="dr-seed-tag">{SEED_TEXT[assignment.seed]}</span> : null}
          </p>
        </div>
      </header>
      <div className="dr-list">
        {own.map((match) => (
          <MatchCard key={match.code} match={match} onTeam={(id) => (id === teamId ? undefined : onTeam(id))} highlightTeam={teamId} linkable={official} showWhen />
        ))}
      </div>
      <p className="dr-team-ko">Top two in Group {assignment.group}, or one of the two best third-placed teams, play the quarterfinals on Sunday from 11:45 AM.</p>
      <div className="dr-share" role="group" aria-label="Share these fixtures">
        <button type="button" className="dr-btn dr-btn--gold dr-btn--sm" disabled={busy} onClick={shareImage}>
          Share image
        </button>
        <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" disabled={busy} onClick={saveImage}>
          Save image
        </button>
        {official ? (
          <>
            <a className="dr-btn dr-btn--ghost dr-btn--sm" href={`https://wa.me/?text=${encodeURIComponent(`${summary()}\n${link()}`)}`} target="_blank" rel="noopener noreferrer">
              Share on WhatsApp
            </a>
            <button
              type="button"
              className="dr-btn dr-btn--ghost dr-btn--sm"
              onClick={() =>
                navigator.clipboard?.writeText(link()).then(
                  () => setNote("Link copied."),
                  () => setNote("Copy the address from the browser bar."),
                )
              }
            >
              Copy link
            </button>
          </>
        ) : null}
      </div>
      {note ? (
        <p className="dr-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
