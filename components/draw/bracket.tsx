"use client";

import { FINAL_FROM, QF_PAIRINGS, SEED_DESCRIPTIONS, SF_PAIRINGS } from "@/lib/draw/bracket";
import { timeText, type ViewMatch } from "@/lib/draw/view";
import { SideName } from "./match-card";

function Slot({ match, onTeam }: { match: ViewMatch; onTeam?: (teamId: string) => void }) {
  const winnerA = match.winnerLabel != null && match.winnerLabel === match.a.label;
  const winnerB = match.winnerLabel != null && match.winnerLabel === match.b.label;
  return (
    <div className={`dr-bk-card dr-bk-card--${match.stage}`} data-code={match.code}>
      <header>
        <b>{match.code === "F" ? "Final" : match.code}</b>
        <span>
          {timeText(match.startMinutes)} · {match.groundName}
        </span>
      </header>
      <div className={winnerA ? "dr-bk-team dr-bk-team--win" : "dr-bk-team"}>
        <SideName side={match.a} winner={winnerA} onTeam={onTeam} />
      </div>
      <div className={winnerB ? "dr-bk-team dr-bk-team--win" : "dr-bk-team"}>
        <SideName side={match.b} winner={winnerB} onTeam={onTeam} />
      </div>
    </div>
  );
}

/**
 * Quarterfinals to final. On wide screens the winners are joined by lines to the match they feed; on phones the rounds
 * stack and each match says where its winner goes.
 */
export function Bracket({ matches, onTeam }: { matches: ViewMatch[]; onTeam?: (teamId: string) => void }) {
  const byCode = new Map(matches.map((m) => [m.code, m]));
  const get = (code: string) => byCode.get(code) as ViewMatch;
  const filled = QF_PAIRINGS.every((pairing) => get(pairing.code)?.a.teamId);
  const feeds: Record<string, string> = { QF1: "SF1", QF2: "SF1", QF3: "SF2", QF4: "SF2", SF1: "Final", SF2: "Final" };
  return (
    <div className="dr-bracket">
      <p className="dr-bk-note">
        {filled
          ? "The eight qualifiers are in. Winners move forward automatically as results are entered."
          : "Seeds are filled in when the last league result is entered: 1–3 group winners, 4–6 runners-up, 7–8 wildcards."}
      </p>
      <div className="dr-bk-desktop" role="group" aria-label="Knockout bracket">
        <div className="dr-bk-col dr-bk-col--qf">
          {QF_PAIRINGS.map((pairing, index) => (
            <div key={pairing.code} className="dr-bk-cell" style={{ gridRow: `${index * 2 + 1} / span 2` }}>
              <Slot match={get(pairing.code)} onTeam={onTeam} />
            </div>
          ))}
        </div>
        <svg className="dr-bk-lines dr-bk-lines--1" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 12.5H50V25H100M0 37.5H50V25" />
          <path d="M0 62.5H50V75H100M0 87.5H50V75" />
        </svg>
        <div className="dr-bk-col dr-bk-col--sf">
          {SF_PAIRINGS.map((pairing, index) => (
            <div key={pairing.code} className="dr-bk-cell" style={{ gridRow: `${index === 0 ? 2 : 6} / span 2` }}>
              <Slot match={get(pairing.code)} onTeam={onTeam} />
            </div>
          ))}
        </div>
        <svg className="dr-bk-lines dr-bk-lines--2" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 25H50V50H100M0 75H50V50" />
        </svg>
        <div className="dr-bk-col dr-bk-col--f">
          <div className="dr-bk-cell" style={{ gridRow: "4 / span 2" }}>
            <Slot match={get("F")} onTeam={onTeam} />
          </div>
        </div>
      </div>

      <div className="dr-bk-mobile">
        {[
          { title: "Quarterfinals", codes: QF_PAIRINGS.map((p) => p.code) as string[] },
          { title: "Semifinals", codes: SF_PAIRINGS.map((p) => p.code) as string[] },
          { title: "Final", codes: ["F"] },
        ].map((round) => (
          <section key={round.title}>
            <h4>{round.title}</h4>
            {round.codes.map((code) => (
              <div className="dr-bk-stack" key={code}>
                <Slot match={get(code)} onTeam={onTeam} />
                {feeds[code] ? <span className="dr-bk-feeds">Winner goes to {feeds[code]}</span> : null}
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="dr-bk-seeds">
        {Object.entries(SEED_DESCRIPTIONS).map(([seed, text]) => `Seed ${seed}: ${text}`).join(" · ")} · Final: {FINAL_FROM.join(" v ")} winners.
      </p>
    </div>
  );
}
