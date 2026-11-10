// The reveal as plain data. Every viewer builds the same timeline from the same saved draw, so a
// shared start time keeps them in step and a late joiner can jump to the right beat.

import type { DrawPlan, GroupCode, RevealStep } from "./types";

export type Beat =
  | { kind: "countdown"; at: number; dur: number }
  | { kind: "opening"; at: number; dur: number }
  | { kind: "seeds-intro"; at: number; dur: number }
  | { kind: "place"; at: number; dur: number; step: RevealStep; revealMs: number; flyMs: number }
  | { kind: "draw-intro"; at: number; dur: number }
  | { kind: "groups"; at: number; dur: number }
  | { kind: "fixtures"; at: number; dur: number; group: GroupCode }
  | { kind: "schedule"; at: number; dur: number; day: 1 | 2 }
  | { kind: "done"; at: number; dur: number };

export type Timeline = { beats: Beat[]; total: number };

export type TimelineOptions = {
  /** 1 = normal, 2 = twice as fast. */
  speed?: number;
  /** Users who prefer reduced motion get short, stepped beats with no flight. */
  reduced?: boolean;
  /** Skip the pre-roll countdown (used for replays). */
  countdown?: boolean;
};

const BASE = {
  countdown: 3000,
  opening: 3200,
  seedsIntro: 2800,
  seedReveal: 1700,
  seedFly: 900,
  drawIntro: 2200,
  drawReveal: 900,
  drawFly: 700,
  settle: 150,
  groups: 5000,
  fixturesPerGroup: 3200,
  schedulePerDay: 4800,
  done: 0,
};

const REDUCED = {
  countdown: 1500,
  opening: 1200,
  seedsIntro: 1000,
  seedReveal: 600,
  seedFly: 0,
  drawIntro: 800,
  drawReveal: 450,
  drawFly: 0,
  settle: 0,
  groups: 2200,
  fixturesPerGroup: 1400,
  schedulePerDay: 2200,
  done: 0,
};

export function buildTimeline(plan: DrawPlan, options: TimelineOptions = {}): Timeline {
  const speed = options.speed && options.speed > 0 ? options.speed : 1;
  const table = options.reduced ? REDUCED : BASE;
  const beats: Beat[] = [];
  let at = 0;
  const push = (beat: { kind: Beat["kind"]; dur: number; [key: string]: unknown }) => {
    const dur = Math.round(beat.dur / speed);
    beats.push({ ...beat, at, dur } as Beat);
    at += dur;
  };

  if (options.countdown !== false) push({ kind: "countdown", dur: table.countdown });
  push({ kind: "opening", dur: table.opening });
  push({ kind: "seeds-intro", dur: table.seedsIntro });
  const seeds = plan.result.reveal.filter((step) => step.phase === "seed");
  const draws = plan.result.reveal.filter((step) => step.phase === "draw");
  for (const step of seeds) {
    push({ kind: "place", step, revealMs: Math.round(table.seedReveal / speed), flyMs: Math.round(table.seedFly / speed), dur: table.seedReveal + table.seedFly + table.settle });
  }
  push({ kind: "draw-intro", dur: table.drawIntro });
  for (const step of draws) {
    push({ kind: "place", step, revealMs: Math.round(table.drawReveal / speed), flyMs: Math.round(table.drawFly / speed), dur: table.drawReveal + table.drawFly + table.settle });
  }
  push({ kind: "groups", dur: table.groups });
  for (const group of ["A", "B", "C"] as const) push({ kind: "fixtures", group, dur: table.fixturesPerGroup });
  for (const day of [1, 2] as const) push({ kind: "schedule", day, dur: table.schedulePerDay });
  push({ kind: "done", dur: table.done });
  return { beats, total: at };
}

/** Index of the beat playing at `elapsed` ms. Past the end returns the last beat. */
export function beatIndexAt(timeline: Timeline, elapsed: number): number {
  if (elapsed <= 0) return 0;
  for (let index = 0; index < timeline.beats.length; index += 1) {
    const beat = timeline.beats[index] as Beat;
    if (elapsed < beat.at + beat.dur) return index;
  }
  return timeline.beats.length - 1;
}

/** Teams already settled in their positions when beat `index` is playing (the current one is still in flight). */
export function placedBefore(timeline: Timeline, index: number): RevealStep[] {
  return timeline.beats.slice(0, index).flatMap((beat) => (beat.kind === "place" ? [beat.step] : []));
}
