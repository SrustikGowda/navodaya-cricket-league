"use client";

import Link from "next/link";
import { SEED_DESCRIPTIONS } from "@/lib/draw/bracket";
import { DAY_LABEL, timeText, type ViewMatch, type ViewSide } from "@/lib/draw/view";

const STATUS: Record<string, string> = {
  in_progress: "Live",
  completed: "Result",
  delayed: "Delayed",
  abandoned: "No result",
  cancelled: "Cancelled",
};

export function matchLabel(match: Pick<ViewMatch, "stage" | "group" | "code">): string {
  if (match.stage === "league") return `Group ${match.group}`;
  if (match.stage === "final") return "Final";
  return `${match.stage === "quarterfinal" ? "Quarterfinal" : "Semifinal"} ${match.code.slice(2)}`;
}

function seedNumber(placeholder: string | null): number | null {
  const found = placeholder?.match(/^seed:(\d)$/);
  return found ? Number(found[1]) : null;
}

export function SideName({ side, winner, onTeam }: { side: ViewSide; winner: boolean; onTeam?: (teamId: string) => void }) {
  const seed = seedNumber(side.placeholder);
  const known = Boolean(side.teamId);
  return (
    <span className={["dr-side", known ? "" : "dr-side--ph", winner ? "dr-side--win" : ""].filter(Boolean).join(" ")}>
      {known && onTeam ? (
        <button type="button" className="dr-team-btn" onClick={() => onTeam(side.teamId as string)} aria-label={`${side.label}: show this team's matches`}>
          {side.label}
        </button>
      ) : (
        <span>{side.label}</span>
      )}
      {seed ? <small>{SEED_DESCRIPTIONS[seed]}</small> : null}
    </span>
  );
}

/**
 * One fixture as a small card: who plays, and the result once there is one. Inside the timetable the row gives the
 * time and the column gives the ground, so the card stays quiet; on its own (`showWhen`) it says when and where.
 */
export function MatchCard({
  match,
  onTeam,
  highlightTeam,
  linkable,
  showWhen = false,
}: {
  match: ViewMatch;
  onTeam?: (teamId: string) => void;
  highlightTeam?: string | null;
  linkable: boolean;
  showWhen?: boolean;
}) {
  const winnerA = match.winnerLabel != null && match.winnerLabel === match.a.label;
  const winnerB = match.winnerLabel != null && match.winnerLabel === match.b.label;
  const decided = winnerA || winnerB;
  const status = STATUS[match.status] ?? null;
  const mine = Boolean(highlightTeam && (match.a.teamId === highlightTeam || match.b.teamId === highlightTeam));
  const when = `${DAY_LABEL[match.day]} ${timeText(match.startMinutes)}, ${match.groundName}`;
  const spoken = `Match ${match.number}, ${matchLabel(match)}, ${when}: ${match.a.label} v ${match.b.label}${match.winnerLabel ? `. Won by ${match.winnerLabel}` : ""}`;
  return (
    <article
      className={["dr-match", match.stage !== "league" ? "dr-match--ko" : "", mine ? "dr-match--mine" : "", decided ? "dr-match--done" : ""].filter(Boolean).join(" ")}
      data-code={match.code}
      aria-label={spoken}
    >
      <div className="dr-m-top">
        <span className="dr-m-no">{match.number}</span>
        {/* In a list of one group's or one team's matches the group is already known, so only knockouts are labelled. */}
        {showWhen && match.stage === "league" ? null : <span className="dr-m-label">{matchLabel(match)}</span>}
        {showWhen ? (
          <span className="dr-m-when">
            {DAY_LABEL[match.day].slice(0, 3)} {timeText(match.startMinutes)} · {match.groundName}
          </span>
        ) : (
          <span className="dr-m-ground">{match.groundName}</span>
        )}
        {status ? <span className={`dr-m-status dr-m-status--${match.status}`}>{status}</span> : null}
        {linkable && match.fixtureId ? (
          <Link className="dr-m-link" href={`/2026/matches/${match.fixtureId}`} aria-label={`Match ${match.number} details`}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </Link>
        ) : null}
      </div>
      <div className={decided && !winnerA ? "dr-m-row dr-m-row--lost" : "dr-m-row"}>
        <SideName side={match.a} winner={winnerA} onTeam={onTeam} />
        {match.scoreA ? <span className="dr-m-score">{match.scoreA}</span> : null}
      </div>
      <div className={decided && !winnerB ? "dr-m-row dr-m-row--lost" : "dr-m-row"}>
        <SideName side={match.b} winner={winnerB} onTeam={onTeam} />
        {match.scoreB ? <span className="dr-m-score">{match.scoreB}</span> : null}
      </div>
    </article>
  );
}
