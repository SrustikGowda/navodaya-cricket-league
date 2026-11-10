"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatIst } from "@/lib/format";
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

type TabId = "all" | "saturday" | "sunday" | "groups" | "teams" | "bracket" | "standings";

export type InitialView = { tab?: string; team?: string; day?: string; stage?: string; ground?: string; group?: string };

type Filters = { team: string; group: string; day: string; stage: string; ground: string };

const EMPTY: Filters = { team: "", group: "", day: "", stage: "", ground: "" };

function applyFilters(matches: ViewMatch[], f: Filters): ViewMatch[] {
  return matches.filter((m) => {
    if (f.team && m.a.teamId !== f.team && m.b.teamId !== f.team) return false;
    if (f.group === "KO" ? m.stage === "league" : f.group && m.group !== f.group) return false;
    if (f.day && String(m.day) !== f.day) return false;
    if (f.stage && m.stage !== f.stage) return false;
    if (f.ground && m.ground !== f.ground) return false;
    return true;
  });
}

function bySlot(matches: ViewMatch[]): { key: string; label: string; day: 1 | 2; items: ViewMatch[] }[] {
  const out: { key: string; label: string; day: 1 | 2; items: ViewMatch[] }[] = [];
  for (const match of [...matches].sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.ground.localeCompare(y.ground))) {
    const key = `${match.date}-${match.startMinutes}`;
    let slot = out.find((s) => s.key === key);
    if (!slot) {
      slot = { key, label: timeText(match.startMinutes), day: match.day, items: [] };
      out.push(slot);
    }
    slot.items.push(match);
  }
  return out;
}

export function ScheduleViews({
  kind,
  plan,
  fixtures,
  qualification,
  teams,
  drawRef,
  publishedAt,
  initial,
  onReplay,
}: {
  kind: "official" | "trial";
  plan: DrawPlan;
  fixtures?: LiveFixture[];
  qualification?: Qualification | null;
  teams: PublicTeam[];
  drawRef?: string | null;
  publishedAt?: string | null;
  initial?: InitialView;
  onReplay?: () => void;
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All matches" },
    { id: "saturday", label: "Saturday" },
    { id: "sunday", label: "Sunday" },
    { id: "groups", label: "By group" },
    { id: "teams", label: "By team" },
    { id: "bracket", label: "Knockouts" },
    ...(official ? [{ id: "standings" as const, label: "Standings" }] : []),
  ];
  const startTab = (tabs.find((t) => t.id === initial?.tab)?.id ?? (initial?.team ? "teams" : "saturday")) as TabId;
  const [tab, setTab] = useState<TabId>(startTab);
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY,
    team: resolveTeam(initial?.team),
    group: initial?.group ?? "",
    day: initial?.day === "2026-11-28" ? "1" : initial?.day === "2026-11-29" ? "2" : (initial?.day ?? ""),
    stage: initial?.stage ?? "",
    ground: initial?.ground ?? "",
  });
  const [team, setTeam] = useState<string>(resolveTeam(initial?.team) || (orderedTeams[0]?.id ?? ""));
  const [group, setGroup] = useState<GroupCode>("A");
  const viewsRef = useRef<HTMLDivElement>(null);

  // Keep the address shareable (official only): the team and tab survive a copy-paste.
  useEffect(() => {
    if (!official) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("day");
    url.searchParams.delete("stage");
    url.searchParams.delete("ground");
    if (tab === "teams" && team) {
      url.searchParams.set("team", teamMap.get(team)?.slug ?? team);
      url.searchParams.set("tab", "teams");
    } else {
      url.searchParams.delete("team");
      if (tab === "saturday") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [official, tab, team, teamMap]);

  const openTeam = useCallback((teamId: string) => {
    setTeam(teamId);
    setTab("teams");
    window.requestAnimationFrame(() => viewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const effective: Filters = useMemo(() => {
    if (tab === "saturday") return { ...filters, day: "1" };
    if (tab === "sunday") return { ...filters, day: "2" };
    return filters;
  }, [tab, filters]);
  const listed = useMemo(() => applyFilters(matches, effective), [matches, effective]);
  const filterActive = Object.values(filters).some(Boolean);
  const showFilters = tab === "all" || tab === "saturday" || tab === "sunday";

  const set = (key: keyof Filters) => (event: React.ChangeEvent<HTMLSelectElement>) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className={official ? "dr-views" : "dr-views dr-views--trial"} ref={viewsRef} id="dr-views">
      <div className={official ? "dr-banner dr-banner--official" : "dr-banner dr-banner--trial"} role="status">
        {official ? (
          <>
            <span className="dr-banner-tag">Official</span>
            <span>
              Draw <b>{drawRef}</b>
              {publishedAt ? <> · published {formatIst(publishedAt)}</> : null}
            </span>
            {onReplay ? (
              <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" onClick={onReplay}>
                Replay reveal
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span className="dr-banner-tag">Trial</span>
            <span>
              <b>TRIAL / DEMO — NOT OFFICIAL.</b> A practice draw from the real roster. Nothing here is saved or published.
            </span>
          </>
        )}
      </div>

      <div className="dr-tabs" role="tablist" aria-label="Schedule views">
        {tabs.map((item) => (
          <button key={item.id} role="tab" type="button" id={`dr-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="dr-panel" className={tab === item.id ? "is-active" : undefined} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {showFilters ? (
        <div className="dr-filters" role="group" aria-label="Filter matches">
          <label>
            <span>Team</span>
            <select value={filters.team} onChange={set("team")}>
              <option value="">All teams</option>
              {orderedTeams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Group</span>
            <select value={filters.group} onChange={set("group")}>
              <option value="">All</option>
              <option value="A">Group A</option>
              <option value="B">Group B</option>
              <option value="C">Group C</option>
              <option value="KO">Knockouts</option>
            </select>
          </label>
          {tab === "all" ? (
            <label>
              <span>Day</span>
              <select value={filters.day} onChange={set("day")}>
                <option value="">Both days</option>
                <option value="1">Saturday</option>
                <option value="2">Sunday</option>
              </select>
            </label>
          ) : null}
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
          {filterActive ? (
            <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" onClick={() => setFilters(EMPTY)}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <div id="dr-panel" role="tabpanel" aria-labelledby={`dr-tab-${tab}`} className="dr-panel">
        {tab === "all" || tab === "saturday" || tab === "sunday" ? (
          <Timetable matches={listed} onTeam={openTeam} highlightTeam={filters.team || null} linkable={official} withDays={tab === "all"} />
        ) : null}
        {tab === "groups" ? <GroupsPanel plan={plan} matches={matches} names={names} teams={teamMap} group={group} setGroup={setGroup} onTeam={openTeam} linkable={official} /> : null}
        {tab === "teams" ? (
          <TeamPanel
            kind={kind}
            plan={plan}
            matches={matches}
            teamId={team}
            setTeam={setTeam}
            orderedTeams={orderedTeams}
            teams={teamMap}
            drawRef={drawRef ?? null}
            onTeam={openTeam}
          />
        ) : null}
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

function Timetable({ matches, onTeam, highlightTeam, linkable, withDays }: { matches: ViewMatch[]; onTeam: (teamId: string) => void; highlightTeam: string | null; linkable: boolean; withDays: boolean }) {
  if (matches.length === 0) return <p className="dr-empty">No matches fit those filters.</p>;
  const slots = bySlot(matches);
  return (
    <div className="dr-timetable">
      {slots.map((slot, position) => {
        const heading = withDays && slot.day !== slots[position - 1]?.day ? slot.day : null;
        return (
          <section key={slot.key} className="dr-slot" aria-label={`${DAY_LABEL[slot.day]} ${slot.label}`}>
            {heading ? (
              <h3 className="dr-day">
                {DAY_LABEL[heading]}
                <span>{heading === 1 ? "28 November 2026" : "29 November 2026"}</span>
              </h3>
            ) : null}
            <h4 className="dr-slot-time">{slot.label}</h4>
            <div className="dr-slot-matches">
              {slot.items.map((match) => (
                <MatchCard key={match.code} match={match} onTeam={onTeam} highlightTeam={highlightTeam} linkable={linkable} />
              ))}
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
  const members = plan.result.assignments.filter((a) => a.group === group).sort((x, y) => x.slot - y.slot);
  const own = matches.filter((m) => m.stage === "league" && m.group === group);
  return (
    <div className="dr-groups-panel">
      <div className="dr-chips" role="group" aria-label="Choose a group">
        {(["A", "B", "C"] as const).map((code) => (
          <button key={code} type="button" aria-pressed={group === code} className={group === code ? "is-active" : undefined} onClick={() => setGroup(code)}>
            Group {code}
          </button>
        ))}
      </div>
      <div className="dr-pools">
        {([1, 2] as const).map((pool) => (
          <section key={pool} className="dr-pool-card" aria-label={`Group ${group} sub-pool ${pool}`}>
            <h4>Sub-pool {pool}</h4>
            <ul>
              {members
                .filter((a) => a.subPool === pool)
                .map((a) => {
                  const name = names.get(a.teamId) ?? a.teamId;
                  return (
                    <li key={a.teamId} className={a.seed ? "is-seed" : undefined}>
                      <i className="dr-slot-tag">{slotCodeOf(a)}</i>
                      <TeamMark name={name} logoUrl={teams.get(a.teamId)?.logoUrl} size={26} />
                      <button type="button" className="dr-link" onClick={() => onTeam(a.teamId)}>
                        {name}
                      </button>
                      {a.seed ? <em className="dr-seed-tag">{SEED_TEXT[a.seed]}</em> : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
      <h4 className="dr-subtitle">Group {group} league matches</h4>
      <div className="dr-list">
        {[...own]
          .sort((x, y) => x.startsAt.localeCompare(y.startsAt))
          .map((match) => (
            <MatchCard key={match.code} match={match} onTeam={onTeam} linkable={linkable} />
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
      groupLine: assignment ? `Group ${assignment.group} · Sub-pool ${assignment.subPool} · ${slotCodeOf(assignment)}` : "",
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
      <label className="dr-team-pick">
        <span>Team</span>
        <select value={teamId} onChange={(event) => setTeam(event.target.value)}>
          {orderedTeams.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <header className="dr-team-head">
        <TeamMark name={name} logoUrl={info?.logoUrl} size={56} />
        <div>
          <h3>{name}</h3>
          <p>
            Group {assignment.group} · Sub-pool {assignment.subPool} · <b>{slotCodeOf(assignment)}</b>
          </p>
          {assignment.seed ? <em className="dr-seed-tag">{SEED_TEXT[assignment.seed]}</em> : null}
        </div>
      </header>
      <h4 className="dr-subtitle">Three league matches</h4>
      <div className="dr-list">
        {own.map((match) => (
          <MatchCard key={match.code} match={match} onTeam={(id) => (id === teamId ? undefined : onTeam(id))} highlightTeam={teamId} linkable={official} />
        ))}
      </div>
      <p className="dr-team-ko">Knockouts: top two in Group {assignment.group}, or one of the two best third-placed teams, play the quarterfinals on Sunday from 11:45 AM.</p>
      <div className="dr-share" role="group" aria-label="Share these fixtures">
        {official ? (
          <>
            <a className="dr-btn dr-btn--ghost" href={`https://wa.me/?text=${encodeURIComponent(`${summary()}\n${link()}`)}`} target="_blank" rel="noopener noreferrer">
              Share on WhatsApp
            </a>
            <button type="button" className="dr-btn dr-btn--ghost" onClick={() => navigator.clipboard?.writeText(link()).then(() => setNote("Link copied."), () => setNote("Copy the address from the browser bar."))}>
              Copy link
            </button>
          </>
        ) : null}
        <button type="button" className="dr-btn dr-btn--gold" disabled={busy} onClick={shareImage}>
          Share image
        </button>
        <button type="button" className="dr-btn dr-btn--ghost" disabled={busy} onClick={saveImage}>
          Save image
        </button>
      </div>
      {note ? <p className="dr-note" role="status">{note}</p> : null}
    </div>
  );
}
