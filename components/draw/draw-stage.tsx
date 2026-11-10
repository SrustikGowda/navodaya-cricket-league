"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { playCue, setSoundEnabled } from "@/lib/draw/audio";
import { beatIndexAt, buildTimeline, placedBefore, type Beat } from "@/lib/draw/timeline";
import type { DrawPlan, GroupCode, PublicTeam, RevealStep, SeedRole } from "@/lib/draw/types";
import { buildViewMatches, DAY_LABEL, slotCodeOf, timeText, type ViewMatch } from "@/lib/draw/view";
import { PoolDiagram } from "./pool-diagram";
import { TeamMark } from "./team-mark";
import { usePrefersReducedMotion } from "./use-motion";

export type StageMode = "trial" | "official" | "replay";

const SEED_TAG: Record<SeedRole, string> = {
  champion: "Defending champion",
  runner_up: "Runner-up · NCL 2025",
  semifinalist: "Semifinalist · NCL 2025",
};
const SEED_SHORT: Record<SeedRole, string> = { champion: "Champion", runner_up: "Runner-up", semifinalist: "Semifinalist" };
const SEED_INITIALS: Record<SeedRole, string> = { champion: "CH", runner_up: "RU", semifinalist: "SF" };

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
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timeline = useMemo(() => buildTimeline(plan, { reduced, countdown }), [plan, reduced, countdown]);
  const names = useMemo(() => new Map(plan.roster.map((team) => [team.id, team.name])), [plan]);
  const logos = useMemo(() => new Map(teams.map((team) => [team.id, team.logoUrl])), [teams]);
  const matches = useMemo(() => buildViewMatches(plan), [plan]);
  // Beat zero is the countdown when there is one, so the timeline starts that long before the reveal moment.
  const startAt = useMemo(() => revealAt - (countdown ? (timeline.beats[0]?.dur ?? 0) : 0), [revealAt, countdown, timeline]);

  const [index, setIndex] = useState(0);
  const [settled, setSettled] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [sound, setSound] = useState(false);
  const [present, setPresent] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const lastIndex = timeline.beats.length - 1;
  const beat = timeline.beats[index] as Beat;
  const done = beat.kind === "done";

  // Beat controller: absolute times against the shared start, so devices that joined late jump straight to the right beat.
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    const enter = (next: number) => {
      if (stopped) return;
      setIndex(next);
      setSettled(false);
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
  }, [timeline, startAt, lastIndex]);

  // Marks a team as seated when its flight ends, slightly before the next beat starts.
  useEffect(() => {
    if (beat.kind !== "place") return;
    const offset = Math.max(0, Date.now() - (startAt + beat.at));
    const timer = window.setTimeout(() => setSettled(true), Math.max(0, beat.revealMs + beat.flyMs - offset));
    return () => window.clearTimeout(timer);
  }, [beat, startAt]);

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
    if (beat.kind === "done") playCue("done", true);
  }, [beat, sound]);
  useEffect(() => {
    if (sound && settled && beat.kind === "place") playCue("place", true);
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

  const placed = useMemo(() => {
    if (beat.kind === "done" || beat.kind === "groups" || beat.kind === "fixtures" || beat.kind === "schedule") return plan.result.reveal;
    const steps = placedBefore(timeline, index);
    return beat.kind === "place" && settled ? [...steps, beat.step] : steps;
  }, [timeline, index, beat, settled, plan]);
  const placedBySlot = useMemo(() => new Map(placed.map((step) => [`${step.group}${step.slot}`, step])), [placed]);
  const justSeated = beat.kind === "place" && settled ? `${beat.step.group}${beat.step.slot}` : null;
  const boardsVisible = beat.kind !== "countdown" && !["fixtures", "schedule", "done"].includes(beat.kind);
  const announce =
    beat.kind === "place"
      ? settled
        ? `${names.get(beat.step.teamId)} placed in Group ${beat.step.group}, sub-pool ${beat.step.subPool}, position ${beat.step.group}${beat.step.slot}. ${placed.length} of 18 teams assigned.`
        : `Drawn: ${names.get(beat.step.teamId)}.`
      : beat.kind === "done"
        ? trial
          ? "Trial draw complete. Not official."
          : "Official fixtures generated."
        : "";
  const label = trial ? "TRIAL DRAW — NOT OFFICIAL" : "OFFICIAL GROUP DRAW";

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
            <b>{placed.length}</b> / 18 teams assigned
          </span>
          <i style={{ ["--p" as string]: `${(placed.length / 18) * 100}%` }} />
        </div>
        <div className="dr-stage-ctrls">
          <button type="button" className="dr-ic" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Turn sound off" : "Turn sound on"} title="Sound effects (off by default)">
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button type="button" className="dr-ic" onClick={togglePresent} aria-pressed={present || fullscreen} title="Full-screen presentation (F)">
            {present || fullscreen ? "Exit full screen" : "Full screen"}
          </button>
          {!done ? (
            <button type="button" className="dr-ic dr-ic--gold" onClick={() => stopRef.current()}>
              Skip animation
            </button>
          ) : null}
          <button ref={closeRef} type="button" className="dr-ic" onClick={onClose} aria-label="Close the draw">
            Close
          </button>
        </div>
      </header>

      {trial ? <div className="dr-stage-wm" aria-hidden="true">TRIAL / DEMO — NOT OFFICIAL</div> : null}
      <p className="dr-sr" aria-live="polite">{announce}</p>

      <main className="dr-stage-main">
        {beat.kind === "countdown" ? <Countdown remaining={remaining} /> : null}
        {beat.kind === "opening" ? <Opening trial={trial} /> : null}

        {boardsVisible ? (
          <Boards placed={placedBySlot} names={names} logos={logos} justSeated={justSeated} target={beat.kind === "place" ? `${beat.step.group}${beat.step.slot}` : null} showSeeds={beat.kind === "groups"} />
        ) : null}

        {beat.kind === "seeds-intro" ? (
          <Caption kicker="Seeded first" title="The four NCL 2025 semifinalists" ms={beat.dur}>
            Champion and runner-up go to <b>separate groups</b>. The other two semifinalists go to <b>Group C, in opposite sub-pools</b>.
          </Caption>
        ) : null}
        {beat.kind === "draw-intro" ? (
          <Caption kicker="Random draw" title="14 teams. 14 open places." ms={beat.dur}>
            Each team is drawn, then placed in the group and sub-pool its draw assigns.
          </Caption>
        ) : null}
        {beat.kind === "place" ? <FlyCard key={beat.step.order} beat={beat} startAt={startAt} names={names} logos={logos} rootRef={rootRef} reduced={reduced} total={plan.result.reveal.length} /> : null}
        {beat.kind === "groups" ? (
          <Caption kicker="All 18 assigned" title="The groups are set" compact ms={beat.dur}>
            Seeded teams are marked. Next: the three league matches for every team.
          </Caption>
        ) : null}

        {beat.kind === "fixtures" ? <FixtureCreation key={beat.group} group={beat.group} plan={plan} names={names} matches={matches} reduced={reduced} /> : null}
        {beat.kind === "schedule" ? <DaySchedule key={beat.day} day={beat.day} matches={matches} /> : null}
        {beat.kind === "done" ? <Finished mode={mode} plan={plan} drawRef={drawRef} placed={placedBySlot} names={names} logos={logos} onClose={onClose} onAgain={onAgain} /> : null}
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

function Opening({ trial }: { trial: boolean }) {
  return (
    <div className="dr-opening">
      <div className="dr-opening-rule" aria-hidden="true" />
      <p>Navodaya Cricket League</p>
      <h2>NCL 2026</h2>
      <h3>{trial ? "Trial group draw" : "Official group draw"}</h3>
      <div className="dr-opening-rule" aria-hidden="true" />
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

/** Three groups, two sub-pools each. Slots are fixed DOM elements so the flying card can land on the exact one. */
function Boards({
  placed,
  names,
  logos,
  justSeated,
  target,
  showSeeds,
}: {
  placed: Map<string, RevealStep>;
  names: Map<string, string>;
  logos: Map<string, string | null>;
  justSeated: string | null;
  target: string | null;
  showSeeds: boolean;
}) {
  return (
    <div className={showSeeds ? "dr-boards dr-boards--final" : "dr-boards"}>
      {(["A", "B", "C"] as GroupCode[]).map((group, boardIndex) => (
        <section className="dr-board" key={group} style={{ ["--b" as string]: boardIndex }} aria-label={`Group ${group}`}>
          <h3>
            <span>Group</span>
            {group}
          </h3>
          <div className="dr-board-pools">
            {([1, 2] as const).map((pool) => (
              <ul key={pool} aria-label={`Sub-pool ${group}${pool}`}>
                <li className="dr-pool-name">
                  Sub-pool {group}
                  {pool}
                </li>
                {[1, 2, 3].map((n) => {
                  const slot = pool === 1 ? n : n + 3;
                  const code = `${group}${slot}`;
                  const step = placed.get(code);
                  const name = step ? names.get(step.teamId) ?? "" : "";
                  const classes = ["dr-slot-row", step ? "is-filled" : "", step?.seed ? "is-seed" : "", justSeated === code ? "is-new" : "", target === code ? "is-target" : ""].filter(Boolean).join(" ");
                  return (
                    <li className={classes} key={code} data-slot={code} data-seed={step?.seed ?? undefined}>
                      <i>{code}</i>
                      {step ? (
                        <>
                          <TeamMark name={name} logoUrl={logos.get(step.teamId)} size={22} />
                          <span className="dr-slot-name">{name}</span>
                          {step.seed ? <em data-short={SEED_INITIALS[step.seed]} title={SEED_TAG[step.seed]}>{SEED_SHORT[step.seed]}</em> : null}
                        </>
                      ) : (
                        <span className="dr-slot-empty" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The drawn team: appears in the middle, then travels to its exact slot. Transforms and opacity only. */
function FlyCard({
  beat,
  startAt,
  names,
  logos,
  rootRef,
  reduced,
  total,
}: {
  beat: Extract<Beat, { kind: "place" }>;
  startAt: number;
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
    animation.currentTime = Math.min(durationMs, Math.max(0, Date.now() - (startAt + beat.at)));
    return () => animation.cancel();
  }, [beat, startAt, durationMs, reduced, rootRef, step.group, step.slot]);

  return (
    <div className={seed ? "dr-fly dr-fly--seed" : "dr-fly"} ref={ref} style={{ opacity: 0 }}>
      <span className="dr-fly-tag">{seed && step.seed ? SEED_TAG[step.seed] : `Team ${step.order} of ${total}`}</span>
      <TeamMark name={name} logoUrl={logos.get(step.teamId)} size={64} />
      <b className="dr-fly-name">{name}</b>
      <span className="dr-fly-dest" style={{ animationDelay: `${Math.round(beat.revealMs * 0.55)}ms` }}>
        Group {step.group} · Sub-pool {step.group}
        {step.subPool}
      </span>
    </div>
  );
}

function FixtureCreation({ group, plan, names, matches, reduced }: { group: GroupCode; plan: DrawPlan; names: Map<string, string>; matches: ViewMatch[]; reduced: boolean }) {
  const members = plan.result.assignments.filter((a) => a.group === group);
  const labelBySlot: Record<string, string> = {};
  const seedBySlot: Record<string, SeedRole> = {};
  for (const a of members) {
    labelBySlot[slotCodeOf(a)] = names.get(a.teamId) ?? "";
    if (a.seed) seedBySlot[slotCodeOf(a)] = a.seed;
  }
  const own = matches.filter((m) => m.stage === "league" && m.group === group);
  const opener = own.find((m) => m.number === 1);
  const rows = [1, 2, 3].flatMap((from) =>
    [4, 5, 6].map((to) => own.find((m) => m.a.slot === `${group}${from}` && m.b.slot === `${group}${to}`)).filter((m): m is ViewMatch => Boolean(m)),
  );
  return (
    <div className="dr-fixcreate">
      <div className="dr-fixcreate-head">
        <span>League fixtures</span>
        <b>Group {group}</b>
        <small>Every team plays the three teams in the opposite sub-pool</small>
      </div>
      <div className="dr-fixcreate-pool">
        <div className="dr-pool-cols" aria-hidden="true">
          <span>Sub-pool {group}1</span>
          <span>Sub-pool {group}2</span>
        </div>
        <PoolDiagram group={group} names={labelBySlot} seeds={seedBySlot} drawLines={!reduced} opener={opener ? [opener.a.slot as string, opener.b.slot as string] : undefined} />
      </div>
      <ol className="dr-fixcreate-list">
        {rows.map((match, i) => (
          <li key={match.code} style={{ ["--i" as string]: i }} className={match.number === 1 ? "is-opener" : undefined}>
            <b>M{String(match.number).padStart(2, "0")}</b>
            <span>
              {match.a.slot} v {match.b.slot}
            </span>
            <small>
              {DAY_LABEL[match.day].slice(0, 3)} {timeText(match.startMinutes)} · Ground {match.ground}
            </small>
          </li>
        ))}
      </ol>
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
        <small>{day === 1 ? "18 league matches · two grounds" : "9 league matches, then the knockouts"}</small>
      </div>
      <ol>
        {slots.map((minutes, i) => {
          const items = rows.filter((m) => m.startMinutes === minutes).sort((x, y) => x.ground.localeCompare(y.ground));
          return (
            <li key={minutes} style={{ ["--i" as string]: i }}>
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
          );
        })}
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
  onClose,
  onAgain,
}: {
  mode: StageMode;
  plan: DrawPlan;
  drawRef?: string | null;
  placed: Map<string, RevealStep>;
  names: Map<string, string>;
  logos: Map<string, string | null>;
  onClose: () => void;
  onAgain?: () => void;
}) {
  const trial = mode === "trial";
  const opener = plan.matches[0];
  return (
    <div className="dr-finished">
      <div className={trial ? "dr-finish-head dr-finish-head--trial" : "dr-finish-head"}>
        <span className="dr-check" aria-hidden="true" />
        <div>
          <b>{trial ? "TRIAL COMPLETE — NOT OFFICIAL" : mode === "replay" ? "OFFICIAL DRAW · REPLAY" : "OFFICIAL FIXTURES GENERATED"}</b>
          <small>
            {trial
              ? "Nothing was saved or published. Run it again as often as you like."
              : `Saved and published${drawRef ? ` as ${drawRef}` : ""}. 27 league matches and 7 knockouts. Everyone visiting the Fixtures page now sees this draw.`}
          </small>
        </div>
      </div>
      <Boards placed={placed} names={names} logos={logos} justSeated={null} target={null} showSeeds />
      <p className="dr-finish-open">
        Opening match · Saturday 7:30 AM · Ground A: <b>{opener?.teamA.label}</b> v <b>{opener?.teamB.label}</b>
      </p>
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
