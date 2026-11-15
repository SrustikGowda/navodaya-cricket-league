"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { playCue, setSoundEnabled } from "@/lib/draw/audio";
import { BYE_POSITION, GROUP_TEAMS, OPPONENT_TEMPLATE } from "@/lib/draw/config";
import { beatIndexAt, buildTimeline, placedBefore, type Beat } from "@/lib/draw/timeline";
import type { DrawPlan, GroupCode, PublicTeam, RevealStep, SeedRole } from "@/lib/draw/types";
import { buildViewMatches, DAY_LABEL, slotCodeOf, timeText, type ViewMatch } from "@/lib/draw/view";
import { OpponentWeb } from "./group-views";
import { TeamMark } from "./team-mark";
import { usePrefersReducedMotion } from "./use-motion";

export type StageMode = "trial" | "official" | "replay";

const SEED_TAG: Record<SeedRole, string> = {
  champion: "Defending champion",
  runner_up: "Runner-up · NCL 2025",
  semifinalist: "Semifinalist · NCL 2025",
};
const SEED_SHORT: Record<SeedRole, string> = { champion: "Champion", runner_up: "Runner-up", semifinalist: "Semifinalist" };
const TEAM_TOTAL = 19;

type Props = {
  plan: DrawPlan;
  mode: StageMode;
  teams: PublicTeam[];
  drawRef?: string | null;
  /** Epoch ms on this device at which the draw itself begins (after the countdown). May be in the future: a shared official start. */
  revealAt: number;
  countdown: boolean;
  onClose: () => void;
  onAgain?: () => void;
};

export function DrawStage({ plan, mode, teams, drawRef, revealAt, countdown, onClose, onAgain }: Props) {
  const reduced = usePrefersReducedMotion();
  const trial = mode === "trial";
  // The official reveal follows one shared clock, so every screen shows the same moment. Trials and replays belong to one viewer.
  const live = mode === "official";
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timeline = useMemo(() => buildTimeline(plan, { reduced, countdown: live && countdown }), [plan, reduced, countdown, live]);
  const names = useMemo(() => new Map(plan.roster.map((team) => [team.id, team.name])), [plan]);
  const logos = useMemo(() => new Map(teams.map((team) => [team.id, team.logoUrl])), [teams]);
  const matches = useMemo(() => buildViewMatches(plan), [plan]);
  // Beat zero is the countdown when there is one, so the timeline starts that long before the reveal moment.
  const startAt = useMemo(() => revealAt - (live && countdown ? (timeline.beats[0]?.dur ?? 0) : 0), [revealAt, live, countdown, timeline]);

  const [index, setIndex] = useState(0);
  const [beatStart, setBeatStart] = useState(() => Date.now());
  const [settled, setSettled] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [sound, setSound] = useState(false);
  const [present, setPresent] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [started, setStarted] = useState(live);
  const [playing, setPlaying] = useState(live);
  const stopRef = useRef<() => void>(() => {});
  const lastIndex = timeline.beats.length - 1;
  const beat = timeline.beats[index] as Beat;
  const done = beat.kind === "done";

  const goto = useCallback((next: number) => {
    setIndex(next);
    setSettled(false);
    setBeatStart(Date.now());
  }, []);

  // Live: absolute times against the shared start, so devices that joined late jump straight to the right beat.
  useEffect(() => {
    if (!live) return;
    let timer = 0;
    let stopped = false;
    const enter = (next: number) => {
      if (stopped) return;
      setIndex(next);
      setSettled(false);
      setBeatStart(startAt + (timeline.beats[next] as Beat).at);
      if (next >= lastIndex) return;
      const target = startAt + (timeline.beats[next] as Beat).at + (timeline.beats[next] as Beat).dur;
      timer = window.setTimeout(() => enter(next + 1), Math.max(0, target - Date.now()));
    };
    const elapsed = Date.now() - startAt;
    enter(elapsed <= 0 ? 0 : beatIndexAt(timeline, elapsed));
    stopRef.current = () => {
      stopped = true;
      window.clearTimeout(timer);
      setIndex(lastIndex);
      setSettled(true);
    };
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [live, timeline, startAt, lastIndex]);

  // Trial and replay: one beat after another while playing; pausing holds the current beat.
  useEffect(() => {
    if (live || !playing || index >= lastIndex) return;
    const timer = window.setTimeout(() => goto(index + 1), (timeline.beats[index] as Beat).dur);
    return () => window.clearTimeout(timer);
  }, [live, playing, index, lastIndex, timeline, goto]);

  // Marks a team as seated when its flight ends, slightly before the next beat starts.
  useEffect(() => {
    if (beat.kind !== "place" && beat.kind !== "bye") return;
    const wait = beat.kind === "place" ? beat.revealMs + beat.flyMs : Math.round(beat.revealMs * 0.45);
    const offset = Math.max(0, Date.now() - beatStart);
    const timer = window.setTimeout(() => setSettled(true), Math.max(0, wait - offset));
    return () => window.clearTimeout(timer);
  }, [beat, beatStart]);

  // Countdown display and the "starting in" wait for a shared start.
  useEffect(() => {
    if (beat.kind !== "countdown") return;
    const tick = () => setRemaining(Math.max(0, startAt + beat.at + beat.dur - Date.now()));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [beat, startAt]);

  // Sound cues follow the beats.
  useEffect(() => {
    if (!sound) return;
    if (beat.kind === "place") playCue(beat.step.phase === "seed" ? "seed" : "reveal", true);
    if (beat.kind === "bye") playCue("seed", true);
    if (beat.kind === "done") playCue("done", true);
  }, [beat, sound]);
  useEffect(() => {
    if (sound && settled && (beat.kind === "place" || beat.kind === "bye")) playCue("place", true);
  }, [settled, beat, sound]);

  const togglePresent = useCallback(() => {
    setPresent((value) => {
      const next = !value;
      const root = rootRef.current;
      if (next && root?.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
      if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return next;
    });
  }, []);

  // Dialog behaviour: focus, scroll lock, Escape, fullscreen state.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) onClose();
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) togglePresent();
    };
    const onFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
  };

  const skip = () => {
    if (live) stopRef.current();
    else {
      setPlaying(false);
      setStarted(true);
      goto(lastIndex);
      setSettled(true);
    }
  };
  const nextTeam = () => {
    const next = timeline.beats.findIndex((candidate, i) => i > index && (candidate.kind === "place" || candidate.kind === "bye"));
    setStarted(true);
    goto(next === -1 ? lastIndex : next);
  };
  const replay = () => {
    setStarted(true);
    setPlaying(true);
    goto(0);
  };

  const placed = useMemo(() => {
    if (["done", "groups", "fixtures", "schedule", "knockouts"].includes(beat.kind)) return plan.result.reveal;
    const steps = placedBefore(timeline, index);
    return (beat.kind === "place" || beat.kind === "bye") && settled ? [...steps, beat.step] : steps;
  }, [timeline, index, beat, settled, plan]);
  const placedBySlot = useMemo(() => new Map(placed.map((step) => [`${step.group}${step.slot}`, step])), [placed]);
  const justSeated = (beat.kind === "place" || beat.kind === "bye") && settled ? `${beat.step.group}${beat.step.slot}` : null;
  const boardsVisible = !["countdown", "opening", "fixtures", "schedule", "knockouts", "done"].includes(beat.kind);
  const announce =
    beat.kind === "place"
      ? settled
        ? `${names.get(beat.step.teamId)} placed at ${beat.step.group}${beat.step.slot}. ${placed.length} of ${TEAM_TOTAL} teams assigned.`
        : `Drawn: ${names.get(beat.step.teamId)}.`
      : beat.kind === "bye"
        ? `${names.get(beat.step.teamId)} receives the BYE at ${BYE_POSITION}: two matches and one BYE.`
        : beat.kind === "done"
          ? trial
            ? "Trial draw complete. Not official."
            : "Official draw completed."
          : "";
  const label = trial ? "TRIAL RUN — NOT OFFICIAL" : "OFFICIAL GROUP DRAW";
  const waiting = !live && !started;

  return (
    <div
      ref={rootRef}
      className={["dr-stage", present || fullscreen ? "dr-present" : "", reduced ? "dr-reduced" : "", trial ? "dr-stage--trial" : ""].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={`NCL 2026 ${label.toLowerCase()}`}
      data-beat={beat.kind}
    >
      <div className="dr-stage-light" aria-hidden="true" />
      <header className="dr-stage-bar">
        <div className="dr-stage-title">
          <span>NCL 2026</span>
          <b>{label}</b>
        </div>
        <div className="dr-stage-progress" aria-hidden={done ? undefined : true}>
          <span>
            <b>{placed.length}</b> / {TEAM_TOTAL} teams assigned
          </span>
          <i style={{ ["--p" as string]: `${(placed.length / TEAM_TOTAL) * 100}%` }} />
        </div>
        <div className="dr-stage-ctrls">
          {!live && started && !done ? (
            <>
              <button type="button" className="dr-ic" onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
                {playing ? "Pause" : "Auto play"}
              </button>
              <button type="button" className="dr-ic" onClick={nextTeam}>
                Next team
              </button>
            </>
          ) : null}
          {!live && started ? (
            <button type="button" className="dr-ic" onClick={replay}>
              Replay
            </button>
          ) : null}
          <button type="button" className="dr-ic" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Turn sound off" : "Turn sound on"} title="Sound effects (off by default)">
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button type="button" className="dr-ic" onClick={togglePresent} aria-pressed={present || fullscreen} title="Full-screen presentation (F)">
            {present || fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          {!done ? (
            <button type="button" className="dr-ic dr-ic--gold" onClick={skip}>
              Skip animation
            </button>
          ) : null}
          <button ref={closeRef} type="button" className="dr-ic" onClick={onClose} aria-label="Close the draw">
            Close
          </button>
        </div>
      </header>

      {trial ? <div className="dr-stage-wm" aria-hidden="true">TRIAL RUN — NOT OFFICIAL</div> : null}
      <p className="dr-sr" aria-live="polite">{announce}</p>

      <main className="dr-stage-main">
        {beat.kind === "countdown" ? <Countdown remaining={remaining} /> : null}
        {beat.kind === "opening" ? <Opening trial={trial} waiting={waiting} onStart={() => { setStarted(true); setPlaying(true); }} /> : null}

        {boardsVisible ? (
          <Boards
            plan={plan}
            placed={placedBySlot}
            names={names}
            logos={logos}
            justSeated={justSeated}
            target={beat.kind === "place" || beat.kind === "bye" ? `${beat.step.group}${beat.step.slot}` : null}
            final={beat.kind === "groups"}
          />
        ) : null}

        {beat.kind === "seeds-intro" ? (
          <Caption kicker="Seeded first" title="The four NCL 2025 semifinalists" ms={beat.dur}>
            The champions take <b>A1</b> and play the opening match. The runners-up go to <b>Group B</b>. The other two semifinalists go <b>one to each group</b>. No seeded team can receive the BYE.
          </Caption>
        ) : null}
        {beat.kind === "draw-intro" ? (
          <Caption kicker="Random draw" title="14 teams. 14 open places." ms={beat.dur}>
            Drawn by the server and saved before you see it. Your screen only shows the result.
          </Caption>
        ) : null}
        {beat.kind === "place" ? <FlyCard key={beat.step.order} beat={beat} beatStart={beatStart} names={names} logos={logos} rootRef={rootRef} reduced={reduced} total={plan.result.reveal.length} /> : null}
        {beat.kind === "bye" ? <ByeReveal key="bye" beat={beat} names={names} logos={logos} /> : null}
        {beat.kind === "groups" ? (
          <Caption kicker="All 19 assigned" title="The groups are set" compact ms={beat.dur}>
            Group A: 9 teams and the BYE. Group B: 10 teams. Next: who plays whom.
          </Caption>
        ) : null}

        {beat.kind === "fixtures" ? <FixtureCreation key={beat.group} group={beat.group} plan={plan} names={names} matches={matches} reduced={reduced} /> : null}
        {beat.kind === "schedule" ? <DaySchedule key={beat.day} day={beat.day} matches={matches} /> : null}
        {beat.kind === "knockouts" ? <KnockoutPath matches={matches} /> : null}
        {beat.kind === "done" ? <Finished mode={mode} plan={plan} drawRef={drawRef} placed={placedBySlot} names={names} logos={logos} matches={matches} onClose={onClose} onAgain={onAgain} /> : null}
      </main>
    </div>
  );
}

function Countdown({ remaining }: { remaining: number }) {
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="dr-countdown" role="status">
      <p>NCL 2026 · Official group draw</p>
      <div key={seconds} className="dr-count-n">{seconds > 0 && seconds <= 5 ? seconds : "…"}</div>
      <small>{seconds > 5 ? "Waiting for the official start" : "The draw begins"}</small>
    </div>
  );
}

function Opening({ trial, waiting, onStart }: { trial: boolean; waiting: boolean; onStart: () => void }) {
  return (
    <div className={waiting ? "dr-opening dr-opening--wait" : "dr-opening"}>
      <div className="dr-opening-rule" aria-hidden="true" />
      <p>Navodaya Cricket League</p>
      <h2>NCL 2026</h2>
      <h3>{trial ? "Trial run · not official" : "Official group draw"}</h3>
      <small className="dr-opening-meta">19 teams · 2 groups</small>
      <div className="dr-opening-rule" aria-hidden="true" />
      {waiting ? (
        <button type="button" className="dr-btn dr-btn--gold dr-btn--xl dr-opening-start" onClick={onStart}>
          Start reveal
        </button>
      ) : null}
    </div>
  );
}

function Caption({ kicker, title, children, compact, ms }: { kicker: string; title: string; children: React.ReactNode; compact?: boolean; ms: number }) {
  return (
    <div className={compact ? "dr-caption dr-caption--compact" : "dr-caption"} style={compact ? undefined : { animationDuration: `${ms}ms` }}>
      <span>{kicker}</span>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}

/** Two groups of positions. Rows are fixed DOM elements so the flying card can land on the exact one. */
function Boards({
  plan,
  placed,
  names,
  logos,
  justSeated,
  target,
  final,
}: {
  plan: DrawPlan;
  placed: Map<string, RevealStep>;
  names: Map<string, string>;
  logos: Map<string, string | null>;
  justSeated: string | null;
  target: string | null;
  final: boolean;
}) {
  return (
    <div className={final ? "dr-boards dr-boards--two dr-boards--final" : "dr-boards dr-boards--two"}>
      {(["A", "B"] as GroupCode[]).map((group, boardIndex) => (
        <section className="dr-board" key={group} style={{ ["--b" as string]: boardIndex }} aria-label={`Group ${group}`}>
          <h3>
            <span>Group</span>
            {group}
            <small>{group === "A" ? "9 teams + BYE" : "10 teams"}</small>
          </h3>
          <ul className="dr-board-list" aria-label={`Group ${group} positions`}>
            {Array.from({ length: GROUP_TEAMS[group] }, (_, n) => n + 1).map((slot) => {
              const code = `${group}${slot}`;
              const step = placed.get(code);
              const name = step ? names.get(step.teamId) ?? "" : "";
              const isBye = code === BYE_POSITION;
              const classes = ["dr-slot-row", step ? "is-filled" : "", step?.seed ? "is-seed" : "", isBye ? "is-bye" : "", justSeated === code ? "is-new" : "", target === code ? "is-target" : ""].filter(Boolean).join(" ");
              return (
                <li className={classes} key={code} data-slot={code} data-seed={step?.seed ?? undefined}>
                  <i>{code}</i>
                  {step ? (
                    <>
                      <TeamMark name={name} logoUrl={logos.get(step.teamId)} size={22} />
                      <span className="dr-slot-name">{name}</span>
                      {step.seed ? <em title={SEED_TAG[step.seed]}>{SEED_SHORT[step.seed]}</em> : null}
                      {isBye ? <em className="dr-slot-bye">BYE</em> : null}
                    </>
                  ) : isBye ? (
                    <span className="dr-slot-empty dr-slot-empty--bye">BYE</span>
                  ) : (
                    <span className="dr-slot-empty" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {final && plan.bye ? (
        <p className="dr-boards-note">
          <b>BYE · {BYE_POSITION}</b> {names.get(plan.bye.teamId)}: 2 matches + 1 BYE. The only BYE in the tournament.
        </p>
      ) : null}
    </div>
  );
}

/** The drawn team: appears in the middle, then travels to its exact slot. Transforms and opacity only. */
function FlyCard({
  beat,
  beatStart,
  names,
  logos,
  rootRef,
  reduced,
  total,
}: {
  beat: Extract<Beat, { kind: "place" }>;
  beatStart: number;
  names: Map<string, string>;
  logos: Map<string, string | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  reduced: boolean;
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = beat;
  const name = names.get(step.teamId) ?? "";
  const seed = step.phase === "seed";
  const durationMs = beat.revealMs + beat.flyMs;

  useLayoutEffect(() => {
    const card = ref.current;
    const root = rootRef.current;
    if (!card || !root || typeof card.animate !== "function") return;
    const slot = root.querySelector<HTMLElement>(`[data-slot="${step.group}${step.slot}"]`);
    const from = card.getBoundingClientRect();
    const to = slot?.getBoundingClientRect();
    const revealFrac = durationMs > 0 ? beat.revealMs / durationMs : 1;
    let keyframes: Keyframe[];
    if (reduced || !to || beat.flyMs === 0) {
      keyframes = [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.8 },
        { opacity: 0, offset: 1 },
      ];
    } else {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = Math.max(0.2, to.width / from.width);
      keyframes = [
        { opacity: 0, transform: "translate3d(0,18px,0) scale(0.86)", offset: 0, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", offset: Math.min(0.45, revealFrac * 0.5), easing: "linear" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", offset: revealFrac, easing: "cubic-bezier(0.6, 0, 0.2, 1)" },
        { opacity: 1, transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})`, offset: 0.97 },
        { opacity: 0, transform: `translate3d(${dx}px,${dy}px,0) scale(${scale})`, offset: 1 },
      ];
    }
    const animation = card.animate(keyframes, { duration: Math.max(1, durationMs), fill: "both" });
    animation.currentTime = Math.min(durationMs, Math.max(0, Date.now() - beatStart));
    return () => animation.cancel();
  }, [beat, beatStart, durationMs, reduced, rootRef, step.group, step.slot]);

  return (
    <div className={seed ? "dr-fly dr-fly--seed" : "dr-fly"} ref={ref} style={{ opacity: 0 }}>
      <span className="dr-fly-tag">{seed && step.seed ? SEED_TAG[step.seed] : `Team ${step.order} of ${total}`}</span>
      <TeamMark name={name} logoUrl={logos.get(step.teamId)} size={64} />
      <b className="dr-fly-name">{name}</b>
      <span className="dr-fly-dest" style={{ animationDelay: `${Math.round(beat.revealMs * 0.55)}ms` }}>
        {step.group === "A" && step.slot === 1 ? "Group A · A1 · opens the tournament" : `Group ${step.group} · ${step.group}${step.slot}`}
      </span>
    </div>
  );
}

/** The BYE: its own moment, because it is the only one and it matters. */
function ByeReveal({ beat, names, logos }: { beat: Extract<Beat, { kind: "bye" }>; names: Map<string, string>; logos: Map<string, string | null> }) {
  const name = names.get(beat.step.teamId) ?? "";
  return (
    <div className="dr-bye">
      <span className="dr-bye-kicker">The BYE · {BYE_POSITION}</span>
      <div className="dr-bye-team">
        <TeamMark name={name} logoUrl={logos.get(beat.step.teamId)} size={72} />
        <b>{name}</b>
      </div>
      <p className="dr-bye-line">2 Matches + 1 BYE</p>
      <small>The only BYE in the tournament. It is a walkover worth 2 points, not a match.</small>
    </div>
  );
}

function FixtureCreation({ group, plan, names, matches, reduced }: { group: GroupCode; plan: DrawPlan; names: Map<string, string>; matches: ViewMatch[]; reduced: boolean }) {
  const by = new Map(plan.result.assignments.map((a) => [slotCodeOf(a), a]));
  const seeds: Record<string, SeedRole> = {};
  for (const a of plan.result.assignments) if (a.group === group && a.seed) seeds[slotCodeOf(a)] = a.seed;
  const nameOf = (code: string) => (code === "BYE" ? "BYE" : names.get(by.get(code)?.teamId ?? "") ?? code);
  const opener = matches.find((m) => m.number === 1);
  const own = matches.filter((m) => m.stage === "league" && m.group === group).length;
  return (
    <div className="dr-fixcreate dr-fixcreate--web">
      <div className="dr-fixcreate-head">
        <span>League fixtures</span>
        <b>Group {group}</b>
        <small>
          {own} matches{group === "A" ? " + the BYE" : ""} · every team has 3 fixtures
        </small>
      </div>
      <div className="dr-fixweb">
        <OpponentWeb group={group} seeds={seeds} opener={group === "A" && opener ? ["A1", "A2"] : undefined} animate={!reduced} />
        <ul className="dr-fixweb-list">
          {Object.entries(OPPONENT_TEMPLATE[group]).map(([code, opponents], i) => (
            <li key={code} style={{ ["--i" as string]: i }} className={code === "A1" ? "is-opener" : undefined}>
              <i>{code}</i>
              <b>{nameOf(code)}</b>
              <span>{opponents.map((o) => o).join(" · ")}</span>
            </li>
          ))}
        </ul>
      </div>
      {group === "A" && opener ? (
        <p className="dr-fixweb-open">
          Opening match · <b>{opener.a.label}</b> v <b>{opener.b.label}</b> · {DAY_LABEL[opener.day]} {timeText(opener.startMinutes)} · {opener.groundName}
        </p>
      ) : (
        <p className="dr-fixweb-open">Group B is a ring: each team plays its two neighbours and the team five places away.</p>
      )}
    </div>
  );
}

function DaySchedule({ day, matches }: { day: 1 | 2; matches: ViewMatch[] }) {
  const rows = matches.filter((m) => m.day === day);
  const slots = [...new Set(rows.map((m) => m.startMinutes))].sort((a, b) => a - b);
  return (
    <div className="dr-daysched">
      <div className="dr-fixcreate-head">
        <span>{day === 1 ? "28 November 2026" : "29 November 2026"}</span>
        <b>{DAY_LABEL[day]}</b>
        <small>{day === 1 ? "20 league matches · two grounds · inauguration break" : "8 league matches, then the knockouts"}</small>
      </div>
      <ol>
        {slots.map((minutes, i) => {
          const items = rows.filter((m) => m.startMinutes === minutes).sort((x, y) => x.ground.localeCompare(y.ground));
          // The inauguration break: a gap bigger than one slot between two league slots.
          const previous = i > 0 ? (slots[i - 1] as number) : null;
          const breakFrom = day === 1 && previous != null && items.every((m) => m.stage === "league") && minutes - previous > 55 ? previous + 55 : null;
          return (
            <Fragment key={minutes}>
              {breakFrom != null ? (
                <li className="is-break" style={{ ["--i" as string]: i }}>
                  <time>{timeText(breakFrom)}</time>
                  <div>
                    <span>
                      <b>Inauguration break · until {timeText(minutes)}</b>
                    </span>
                  </div>
                </li>
              ) : null}
              <li style={{ ["--i" as string]: i }}>
                <time>{timeText(minutes)}</time>
                <div>
                  {items.map((m) => (
                    <span key={m.code} className={m.stage !== "league" ? "is-ko" : m.number === 1 ? "is-opener" : undefined}>
                      <i>{m.ground}</i>
                      <b>{m.stage === "league" ? `${m.a.label} v ${m.b.label}` : `${m.code === "F" ? "Final" : m.code}: ${m.a.label} v ${m.b.label}`}</b>
                    </span>
                  ))}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function KnockoutPath({ matches }: { matches: ViewMatch[] }) {
  const ko = matches.filter((m) => m.stage !== "league");
  return (
    <div className="dr-daysched dr-ko">
      <div className="dr-fixcreate-head">
        <span>Sunday 29 November</span>
        <b>The knockout path</b>
        <small>Top 4 of each group qualify. Filled in after the organizers confirm the standings.</small>
      </div>
      <ol>
        {ko.map((m, i) => (
          <li key={m.code} style={{ ["--i" as string]: i }}>
            <time>{timeText(m.startMinutes)}</time>
            <div>
              <span className="is-ko">
                <i>{m.ground}</i>
                <b>
                  {m.code === "F" ? "Final" : m.code}: {m.a.label} v {m.b.label}
                </b>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Finished({
  mode,
  plan,
  drawRef,
  placed,
  names,
  logos,
  matches,
  onClose,
  onAgain,
}: {
  mode: StageMode;
  plan: DrawPlan;
  drawRef?: string | null;
  placed: Map<string, RevealStep>;
  names: Map<string, string>;
  logos: Map<string, string | null>;
  matches: ViewMatch[];
  onClose: () => void;
  onAgain?: () => void;
}) {
  const trial = mode === "trial";
  const opener = matches.find((m) => m.number === 1);
  return (
    <div className="dr-finished">
      <div className={trial ? "dr-finish-head dr-finish-head--trial" : "dr-finish-head"}>
        <span className="dr-check" aria-hidden="true" />
        <div>
          <b>{trial ? "TRIAL COMPLETE — NOT OFFICIAL" : mode === "replay" ? "OFFICIAL DRAW · REPLAY" : "OFFICIAL DRAW COMPLETED"}</b>
          <small>
            {trial
              ? "Nothing was saved or published. Run it again as often as you like."
              : `Saved and published${drawRef ? ` as ${drawRef}` : ""}. 28 league matches, the BYE and 7 knockouts. Everyone visiting the Fixtures page now sees this draw.`}
          </small>
        </div>
      </div>
      <Boards plan={plan} placed={placed} names={names} logos={logos} justSeated={null} target={null} final />
      {opener ? (
        <p className="dr-finish-open">
          Opening match · {DAY_LABEL[opener.day]} {timeText(opener.startMinutes)} · {opener.groundName}: <b>{opener.a.label}</b> v <b>{opener.b.label}</b>
        </p>
      ) : null}
      <div className="dr-finish-actions">
        <button type="button" className="dr-btn dr-btn--gold" onClick={onClose}>
          {trial ? "See trial fixtures" : "View fixtures"}
        </button>
        {trial && onAgain ? (
          <button type="button" className="dr-btn dr-btn--ghost" onClick={onAgain}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
