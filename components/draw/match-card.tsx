"use client";

import Link from "next/link";
import { SEED_DESCRIPTIONS } from "@/lib/draw/bracket";
import { statusText, stageText, timeText, type ViewMatch, type ViewSide } from "@/lib/draw/view";

function seedNumber(placeholder: string | null): number | null {
  const match = placeholder?.match(/^seed:(\d)$/);
  return match ? Number(match[1]) : null;
}

export function SideName({ side, winner, onTeam }: { side: ViewSide; winner: boolean; onTeam?: (teamId: string) => void }) {
  const seed = seedNumber(side.placeholder);
  const known = Boolean(side.teamId);
  return (
    <span className={["dr-side", known ? "" : "dr-side--ph", winner ? "dr-side--win" : ""].filter(Boolean).join(" ")}>
      {side.slot ? <i className="dr-slot-tag">{side.slot}</i> : null}
      {known && onTeam ? (
        <button type="button" className="dr-link" onClick={() => onTeam(side.teamId as string)} aria-label={`Show fixtures for ${side.label}`}>
          {side.label}
        </button>
      ) : (
        <span>{side.label}</span>
      )}
      {seed ? <small>{SEED_DESCRIPTIONS[seed]}</small> : null}
    </span>
  );
}

/** One fixture. A row on wide screens, a stacked card on phones. */
export function MatchCard({
  match,
  onTeam,
  highlightTeam,
  linkable,
}: {
  match: ViewMatch;
  onTeam?: (teamId: string) => void;
  highlightTeam?: string | null;
  linkable: boolean;
}) {
  const winnerA = match.winnerLabel != null && match.winnerLabel === match.a.label;
  const winnerB = match.winnerLabel != null && match.winnerLabel === match.b.label;
  const live = match.status === "in_progress";
  const inner = (
    <>
      <span className="dr-m-no">
        <b>{String(match.number).padStart(2, "0")}</b>
        <small>Match</small>
      </span>
      <span className="dr-m-time">
        <b>{timeText(match.startMinutes)}</b>
        <small>{match.groundName}</small>
      </span>
      <span className="dr-m-teams">
        <SideName side={match.a} winner={winnerA} onTeam={onTeam} />
        <em>vs</em>
        <SideName side={match.b} winner={winnerB} onTeam={onTeam} />
      </span>
      <span className="dr-m-stage">
        <b>{stageText(match)}</b>
        <small>{match.overs} overs a side</small>
      </span>
      <span className={`dr-m-status dr-m-status--${match.status}`}>{live ? "Live" : statusText(match.status)}</span>
    </>
  );
  const marked = highlightTeam && (match.a.teamId === highlightTeam || match.b.teamId === highlightTeam);
  return (
    <article className={["dr-match", marked ? "dr-match--mine" : "", match.stage !== "league" ? "dr-match--ko" : ""].filter(Boolean).join(" ")} data-code={match.code}>
      {inner}
      {match.summary ? <p className="dr-m-summary">{match.summary}</p> : null}
      {linkable && match.fixtureId ? (
        <Link className="dr-m-more" href={`/2026/matches/${match.fixtureId}`} aria-label={`Match ${match.number} details`}>
          Details →
        </Link>
      ) : null}
    </article>
  );
}
