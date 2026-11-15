"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/components/analytics-tracker";
import { compareBatch } from "@/lib/batch-order";
import { BYE_RULES, KNOCKOUT_TIE_RULE, LEAGUE_MATCHES, QUALIFICATION_RULES, TIE_BREAKERS, type Timetable } from "@/lib/draw/config";
import { renderShareCard } from "@/lib/draw/share-image";
import type { Qualification } from "@/lib/draw/standings";
import type { DrawPlan, GroupCode, LiveFixture, PublicTeam } from "@/lib/draw/types";
import {
  buildViewBye,
  buildViewMatches,
  DAY_LABEL,
  opponentOf,
  SEED_TEXT,
  slotCodeOf,
  slotOf,
  STAGE_LABEL,
  teamEntries,
  teamNames,
  timeText,
  type ViewBye,
  type ViewMatch,
} from "@/lib/draw/view";
import { Bracket } from "./bracket";
import { GroupCards, GroupPanel } from "./group-views";
import { ByeCard, MatchCard } from "./match-card";
import { StandingsBoard } from "./standings-board";
import { TeamMark } from "./team-mark";

type TabId = "day1" | "day2" | "groupA" | "groupB" | "knockouts" | "team" | "standings";

export type InitialView = { tab?: string; team?: string; day?: string; stage?: string; ground?: string; group?: string };

type Filters = { team: string; group: string; stage: string; ground: string };
const EMPTY: Filters = { team: "", group: "", stage: "", ground: "" };

const DATES: Record<1 | 2, string> = { 1: "28 November", 2: "29 November" };
const TAB_KEY: Record<TabId, string> = { day1: "day1", day2: "day2", groupA: "a", groupB: "b", knockouts: "knockouts", team: "team", standings: "standings" };

function applyFilters(matches: ViewMatch[], f: Filters, day: 1 | 2): ViewMatch[] {
  return matches.filter((m) => {
    if (m.day !== day) return false;
    if (f.team && m.a.teamId !== f.team && m.b.teamId !== f.team) return false;
    if (f.group === "KO" ? m.stage === "league" : f.group && m.group !== f.group) return false;
    if (f.stage && m.stage !== f.stage) return false;
    if (f.ground && m.ground !== f.ground) return false;
    return true;
  });
}

function startTab(initial: InitialView | undefined, official: boolean): TabId {
  const tab = (initial?.tab ?? "").toLowerCase();
  if (tab === "day1" || tab === "day2" || tab === "knockouts" || tab === "team") return tab;
  if (tab === "a" || tab === "groupa" || tab === "groups") return "groupA";
  if (tab === "b" || tab === "groupb") return "groupB";
  if (tab === "bracket") return "knockouts";
  if (tab === "teams") return "team";
  if (tab === "standings" && official) return "standings";
  if (!tab && initial?.team) return "team";
  if (!tab && (initial?.group === "A" || initial?.group === "B")) return initial.group === "A" ? "groupA" : "groupB";
  const day = initial?.day;
  if (day === "2026-11-29" || day === "2" || day === "sunday") return "day2";
  return "day1";
}

export function ScheduleViews({
  kind,
  plan,
  fixtures,
  qualification,
  teams,
  drawRef,
  initial,
  timetable,
  confirmedAt,
}: {
  kind: "official" | "trial";
  plan: DrawPlan;
  fixtures?: LiveFixture[];
  qualification?: Qualification | null;
  teams: PublicTeam[];
  drawRef?: string | null;
  initial?: InitialView;
  timetable?: Timetable;
  confirmedAt?: string | null;
}) {
  const official = kind === "official";
  const matches = useMemo(() => buildViewMatches(plan, fixtures), [plan, fixtures]);
  const bye = useMemo(() => buildViewBye(plan, fixtures), [plan, fixtures]);
  const names = useMemo(() => teamNames(plan), [plan]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  // Oldest batch first, the same order as the Teams page.
  const orderedTeams = useMemo(
    () =>
      [...plan.roster].sort((a, b) =>
        compareBatch(
          { name: a.name, admission: teamMap.get(a.id)?.batchAdmissionYear, leaving: teamMap.get(a.id)?.batchLeavingYear },
          { name: b.name, admission: teamMap.get(b.id)?.batchAdmissionYear, leaving: teamMap.get(b.id)?.batchLeavingYear },
        ),
      ),
    [plan, teamMap],
  );

  const resolveTeam = useCallback(
    (value: string | undefined): string => {
      if (!value) return "";
      const lower = value.toLowerCase();
      const hit = plan.roster.find((team) => team.id === value || teamMap.get(team.id)?.slug === value || team.name.toLowerCase() === lower);
      return hit?.id ?? "";
    },
    [plan, teamMap],
  );

  const tabs: { id: TabId; label: string; short: string }[] = [
    { id: "day1", label: "Day 1 · Saturday", short: "Day 1" },
    { id: "day2", label: "Day 2 · Sunday", short: "Day 2" },
    { id: "groupA", label: "Group A", short: "Group A" },
    { id: "groupB", label: "Group B", short: "Group B" },
    { id: "knockouts", label: "Knockouts", short: "Knockouts" },
    { id: "team", label: "My team", short: "My team" },
    ...(official ? [{ id: "standings" as const, label: "Standings", short: "Table" }] : []),
  ];
  const [tab, setTab] = useState<TabId>(startTab(initial, official));
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, group: initial?.group === "KO" ? "KO" : "", stage: initial?.stage ?? "", ground: initial?.ground ?? "" });
  const [moreFilters, setMoreFilters] = useState(Boolean(initial?.stage || initial?.ground));
  const [team, setTeam] = useState<string>(resolveTeam(initial?.team) || (orderedTeams[0]?.id ?? ""));
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the address shareable (official only): the open tab and team survive a copy-paste.
  useEffect(() => {
    if (!official) return;
    const url = new URL(window.location.href);
    for (const key of ["day", "stage", "ground", "group", "team", "tab"]) url.searchParams.delete(key);
    if (tab === "team" && team) url.searchParams.set("team", teamMap.get(team)?.slug ?? team);
    else if (tab !== "day1") url.searchParams.set("tab", TAB_KEY[tab]);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [official, tab, team, teamMap]);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    track(`tab_${id}`);
  }, []);

  const openTeam = useCallback((teamId: string) => {
    setTeam(teamId);
    selectTab("team");
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectTab]);
  const openGroup = useCallback((group: GroupCode) => {
    selectTab(group === "A" ? "groupA" : "groupB");
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectTab]);

  const day: 1 | 2 = tab === "day2" ? 2 : 1;
  const listed = useMemo(() => applyFilters(matches, filters, day), [matches, filters, day]);
  const extraCount = [filters.group, filters.stage, filters.ground].filter(Boolean).length;
  const set = (key: keyof Filters) => (event: React.ChangeEvent<HTMLSelectElement>) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  const [exportNote, setExportNote] = useState("");

  async function exportSheet(format: "png" | "pdf") {
    setExporting(format);
    setExportNote("");
    try {
      const { downloadSheet } = await import("@/lib/draw/export-sheet");
      await downloadSheet(format, { plan, matches, bye, official, drawRef: drawRef ?? null, names });
      track(format === "png" ? "export_png" : "export_pdf");
      setExportNote(format === "png" ? "Image saved." : "PDF saved.");
    } catch (error) {
      setExportNote(error instanceof Error ? error.message : "The file could not be created.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className={official ? "dr-views" : "dr-views dr-views--trial"} ref={rootRef} id="dr-views" data-ref={drawRef ?? undefined}>
      <GroupCards plan={plan} teams={teamMap} onTeam={openTeam} onGroup={openGroup} />

      <div className="dr-views-bar">
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
              onClick={() => selectTab(item.id)}
              aria-label={item.label}
            >
              <span className="dr-tab-long">{item.label}</span>
              <span className="dr-tab-short" aria-hidden="true">
                {item.short}
              </span>
            </button>
          ))}
        </div>
        <div className="dr-export" role="group" aria-label="Download the schedule and groups">
          <button type="button" className="dr-chipbtn" disabled={exporting !== null} onClick={() => void exportSheet("png")}>
            {exporting === "png" ? "Preparing…" : "PNG"}
          </button>
          <button type="button" className="dr-chipbtn" disabled={exporting !== null} onClick={() => void exportSheet("pdf")}>
            {exporting === "pdf" ? "Preparing…" : "PDF"}
          </button>
        </div>
      </div>
      {exportNote ? (
        <p className="dr-note" role="status">
          {exportNote}
        </p>
      ) : null}

      <div id="dr-panel" role="tabpanel" aria-labelledby={`dr-tab-${tab}`} className="dr-panel">
        {tab === "day1" || tab === "day2" ? (
          <>
            <div className="dr-controls">
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
              {extraCount || filters.team ? (
                <button type="button" className="dr-chipbtn" onClick={() => setFilters(EMPTY)}>
                  Clear
                </button>
              ) : null}
            </div>
            {moreFilters ? (
              <div className="dr-filters" id="dr-more-filters" role="group" aria-label="More filters">
                <label>
                  <span>Group</span>
                  <select value={filters.group} onChange={set("group")}>
                    <option value="">All groups</option>
                    <option value="A">Group A</option>
                    <option value="B">Group B</option>
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
              </div>
            ) : null}
            <Timetable matches={listed} day={day} timetable={timetable ?? plan.timetable} onTeam={openTeam} highlightTeam={filters.team || null} linkable={official} bye={filters.team === bye.teamId ? bye : null} />
          </>
        ) : null}
        {tab === "groupA" ? <GroupPanel group="A" plan={plan} matches={matches} onTeam={openTeam} linkable={official} /> : null}
        {tab === "groupB" ? <GroupPanel group="B" plan={plan} matches={matches} onTeam={openTeam} linkable={official} /> : null}
        {tab === "knockouts" ? <Bracket matches={matches} onTeam={official ? openTeam : undefined} /> : null}
        {tab === "team" ? <TeamPanel kind={kind} plan={plan} matches={matches} bye={bye} teamId={team} setTeam={setTeam} orderedTeams={orderedTeams} teams={teamMap} drawRef={drawRef ?? null} onTeam={openTeam} /> : null}
        {tab === "standings" && official ? (
          qualification ? (
            <StandingsBoard qualification={qualification} names={names} teams={teamMap} onTeam={openTeam} confirmedAt={confirmedAt ?? null} />
          ) : (
            <p className="dr-empty">Standings appear after the first result.</p>
          )
        ) : null}
      </div>

      <details className="dr-rules dr-rules--page">
        <summary>Points, qualification and the BYE</summary>
        <p className="dr-rules-h">Points and ranking</p>
        <ol>
          {TIE_BREAKERS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="dr-rules-h">Qualification</p>
        <ul>
          {QUALIFICATION_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="dr-rules-h">The BYE</p>
        <ul>
          {BYE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="dr-rules-h">Tied knockout matches</p>
        <p>{KNOCKOUT_TIE_RULE}</p>
        <p className="dr-rules-foot">{LEAGUE_MATCHES} league matches, 4 quarterfinals, 2 semifinals and the final: 35 matches. League and quarterfinals are 6 overs a side; semifinals and the final are 8.</p>
      </details>
    </div>
  );
}

/** A day as a real timetable: times down the side, Ground A and Ground B across. Phones stack the two grounds. */
function Timetable({
  matches,
  day,
  timetable,
  onTeam,
  highlightTeam,
  linkable,
  bye,
}: {
  matches: ViewMatch[];
  day: 1 | 2;
  timetable: Timetable;
  onTeam: (teamId: string) => void;
  highlightTeam: string | null;
  linkable: boolean;
  bye: ViewBye | null;
}) {
  if (matches.length === 0 && !bye) return <p className="dr-empty">No matches fit that choice.</p>;
  const rows = matches;
  const slots = [...new Set(rows.map((m) => m.startMinutes))].sort((a, b) => a - b);
  const league = rows.filter((m) => m.stage === "league").length;
  const meta =
    day === 1
      ? `${rows.length} ${rows.length === 1 ? "match" : "matches"} · 6 overs a side`
      : league === rows.length
        ? `${rows.length} league ${rows.length === 1 ? "match" : "matches"} · 6 overs a side`
        : `${rows.length} ${rows.length === 1 ? "match" : "matches"} · quarterfinals 6 overs, semifinals and final 8`;
  const final = rows.find((m) => m.code === "F");
  return (
    <div className="dr-timetable">
      <section className="dr-day" aria-labelledby={`dr-day-${day}`}>
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
            const previous = index > 0 ? (slots[index - 1] as number) : null;
            const previousKnockout = previous != null && rows.filter((m) => m.startMinutes === previous).every((m) => m.stage !== "league");
            // The inauguration break: a gap bigger than one slot between two league slots on Saturday.
            const breakFrom = day === 1 && previous != null && !knockout && minutes - previous > timetable.slotMinutes ? previous + timetable.slotMinutes : null;
            return (
              <div key={minutes} className="dr-slotgroup">
                {breakFrom != null ? (
                  <p className="dr-grid-break">
                    Inauguration break · {timeText(breakFrom)} to {timeText(minutes)} · both grounds
                  </p>
                ) : null}
                {knockout && !previousKnockout ? <p className="dr-grid-divider">Knockouts</p> : null}
                <div className={knockout ? "dr-row dr-row--ko" : "dr-row"}>
                  <time className="dr-row-time">{timeText(minutes)}</time>
                  {(["A", "B"] as const).map((ground) => {
                    const match = inSlot.find((m) => m.ground === ground);
                    if (match) return <MatchCard key={match.code} match={match} onTeam={onTeam} highlightTeam={highlightTeam} linkable={linkable} />;
                    if (final && minutes === final.startMinutes && ground === "B") {
                      return (
                        <div key={ground} className="dr-cell-reserved">
                          Reserved
                        </div>
                      );
                    }
                    return <div key={ground} className="dr-cell-empty" aria-hidden="true" />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {bye ? (
          <div className="dr-list dr-list--bye">
            <ByeCard bye={bye} onTeam={onTeam} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TeamPanel({
  kind,
  plan,
  matches,
  bye,
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
  bye: ViewBye;
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
  const entries = teamEntries(matches, bye, teamId);
  const info = teams.get(teamId);
  const qf1 = matches.find((m) => m.code === "QF1");
  // The page is also rendered on the server, where there is no window: the site address is read after mount.
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
  const link = () => `${origin}/2026/fixtures?team=${encodeURIComponent(info?.slug ?? teamId)}`;
  const summary = () =>
    [
      `${name} — NCL 2026 fixtures${official ? "" : " (TRIAL — NOT OFFICIAL)"}`,
      ...entries.map((entry) =>
        entry.kind === "match" ? `${DAY_LABEL[entry.match.day]} ${timeText(entry.match.startMinutes)} · ${entry.match.groundName} · vs ${opponentOf(entry.match, teamId).label}` : "BYE · walkover, 2 points",
      ),
    ].join("\n");

  async function makeFile(): Promise<File> {
    const blob = await renderShareCard({
      teamName: name,
      groupLine: assignment ? `Group ${assignment.group} · ${slotCodeOf(assignment)}` : "",
      seedLine: assignment?.seed ? SEED_TEXT[assignment.seed] : null,
      entries: entries.map((entry) =>
        entry.kind === "match"
          ? { kind: "match" as const, match: entry.match, opponent: opponentOf(entry.match, teamId).label, opponentSlot: opponentOf(entry.match, teamId).slot }
          : { kind: "bye" as const },
      ),
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
      track("team_image");
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
        track("team_image");
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
  const hasBye = bye.teamId === teamId;
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
            Group {assignment.group} · <b>{slotCodeOf(assignment)}</b>
            {assignment.seed ? <span className="dr-seed-tag">{SEED_TEXT[assignment.seed]}</span> : null}
            {hasBye ? <span className="dr-seed-tag dr-seed-tag--bye">2 matches + 1 BYE</span> : null}
          </p>
        </div>
      </header>
      <div className="dr-list">
        {entries.map((entry) =>
          entry.kind === "match" ? (
            <MatchCard key={entry.match.code} match={entry.match} onTeam={(id) => (id === teamId ? undefined : onTeam(id))} highlightTeam={teamId} linkable={official} showWhen />
          ) : (
            <ByeCard key="bye" bye={entry.bye} />
          ),
        )}
      </div>
      <p className="dr-team-ko">
        The top 4 of Group {assignment.group} play the quarterfinals on Sunday{qf1 ? ` from ${timeText(qf1.startMinutes)}` : ""}.
      </p>
      <div className="dr-share" role="group" aria-label="Share these fixtures">
        <button type="button" className="dr-btn dr-btn--gold dr-btn--sm" disabled={busy} onClick={shareImage}>
          Share image
        </button>
        <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" disabled={busy} onClick={saveImage}>
          Save image
        </button>
        {official ? (
          <>
            <a className="dr-btn dr-btn--ghost dr-btn--sm" href={`https://wa.me/?text=${encodeURIComponent(`${summary()}\n${link()}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("whatsapp")}>
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
