"use client";

import { useEffect, useState } from "react";
import { formatIst } from "@/lib/format";

type Fixture = {
  id: string;
  matchNumber: number | null;
  teamALabel: string;
  teamBLabel: string;
  startsAt: string | null;
  groundName: string | null;
  status: string;
  stage: string;
  scorecardUrl: string | null;
  changeNote: string | null;
};

type Board = {
  grounds: { ground: string; now: Fixture[]; next: Fixture | null; later: Fixture[] }[];
  announcements: { id: string; title: string; body: string }[];
  syncedAt: string;
};

export function MatchDayBoard({ initial, display }: { initial: Board; display: boolean }) {
  const [board, setBoard] = useState(initial);
  const [state, setState] = useState<"live" | "stale" | "offline">("live");

  useEffect(() => {
    let delay = 20000;
    let stopped = false;
    let handle = 0;
    async function poll() {
      if (document.hidden) {
        handle = window.setTimeout(poll, delay);
        return;
      }
      try {
        const response = await fetch("/api/public/match-day");
        if (!response.ok) throw new Error("status");
        setBoard((await response.json()) as Board);
        setState("live");
        delay = 20000;
      } catch {
        setState("offline");
        delay = Math.min(delay * 2, 120000);
      }
      if (!stopped) handle = window.setTimeout(poll, delay);
    }
    const stale = window.setInterval(() => {
      const age = Date.now() - new Date(board.syncedAt).getTime();
      if (age > 90000 && state !== "offline") setState("stale");
    }, 15000);
    handle = window.setTimeout(poll, delay);
    return () => {
      stopped = true;
      window.clearTimeout(handle);
      window.clearInterval(stale);
    };
  }, [board.syncedAt, state]);

  const shell = display ? "display-mode" : "stack";
  return (
    <div className={shell}>
      <p role="status">
        {state === "offline" ? "Offline. Showing the last match-day board this page loaded." : null}
        {state === "stale" ? "This board may be out of date." : null}
        {state === "live" ? `Updated ${formatIst(board.syncedAt)}. In-progress status is set by organizers, not a ball-by-ball feed.` : null}
      </p>
      {board.announcements.map((item) => <p key={item.id} className="note"><strong>{item.title}.</strong> {item.body}</p>)}
      <div className="board">
        {board.grounds.length === 0 ? <p>The match-day board appears after a schedule is published.</p> : null}
        {board.grounds.map((ground) => (
          <article key={ground.ground}>
            <h2>{ground.ground}</h2>
            <MatchGroup label="Now" fixtures={ground.now} />
            <h3>Next</h3>
            {ground.next ? <MatchLine fixture={ground.next} /> : <p className="quiet">No following match on this ground.</p>}
            <h3>Later</h3>
            {ground.later.map((fixture) => <MatchLine key={fixture.id} fixture={fixture} />)}
          </article>
        ))}
      </div>
    </div>
  );
}

function MatchGroup({ label, fixtures }: { label: string; fixtures: Fixture[] }) {
  return (
    <div>
      <h3>{label}</h3>
      {fixtures.length === 0 ? <p className="quiet">Nothing in progress.</p> : fixtures.map((fixture) => <MatchLine key={fixture.id} fixture={fixture} />)}
    </div>
  );
}

function MatchLine({ fixture }: { fixture: Fixture }) {
  return (
    <p className="fixture">
      <b>{fixture.teamALabel} vs {fixture.teamBLabel}</b>
      <span>{fixture.matchNumber ? `Match ${fixture.matchNumber} · ` : ""}{fixture.stage} · {formatIst(fixture.startsAt)} · {fixture.status.replace("_", " ")}</span>
      {fixture.changeNote ? <span>{fixture.changeNote}</span> : null}
      {fixture.scorecardUrl ? <a href={fixture.scorecardUrl}>View scorecard on CricHeroes</a> : null}
    </p>
  );
}
