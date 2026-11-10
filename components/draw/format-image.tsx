import Image from "next/image";
import { POINTS, TIE_BREAKERS } from "@/lib/draw/config";

const SRC = "/brand/ncl-2026-format-v1.png";

// Everything the picture says, in words, for screen readers and for anyone whose image does not load.
const ALT =
  "NCL 2026 tournament format. Three groups of six teams. Each group has two sub-pools of three, and every team plays all three teams in the opposite sub-pool: three league matches each, nine per group, 27 in the league. " +
  "The top 2 from each group (6 teams) and the best 2 third-placed teams (2 teams) make 8 quarterfinalists. " +
  "Quarterfinals are seed 1 v seed 8, seed 4 v seed 5, seed 2 v seed 7 and seed 3 v seed 6. The winners of quarterfinals 1 and 2 meet in semifinal 1, the winners of quarterfinals 3 and 4 meet in semifinal 2, and the two semifinal winners play the final. " +
  "27 league matches plus 7 knockouts make 34 matches. League and quarterfinals are 6 overs a side; semifinals and the final are 8 overs a side.";

const FACTS = [
  { big: "3 × 6", title: "Three groups of six", text: "Each group is split into two sub-pools of three." },
  { big: "3", title: "League matches each", text: "Every team plays the three teams in the other sub-pool." },
  { big: "8", title: "Reach the quarterfinals", text: "Top two of each group, plus the best two third-placed teams." },
  { big: "34", title: "Matches in two days", text: "League and quarterfinals 6 overs a side. Semifinals and final 8." },
] as const;

/**
 * How the tournament works: the organizers' format picture beside four short facts. The facts carry the meaning on
 * phones, where the picture's small text cannot be read; the picture opens full size on tap. The original file is
 * served (about 200 KB) so the text stays sharp.
 */
export function FormatImage() {
  return (
    <div className="dr-about-inner">
      <header className="dr-about-head">
        <p className="dr-eyebrow">How it works</p>
        <h2 id="dr-format-title">The tournament format</h2>
      </header>
      <div className="dr-about-body">
        <figure className="dr-about-figure">
          <a className="dr-format-img" href={SRC} target="_blank" rel="noopener noreferrer" aria-label="Open the tournament format picture full size, in a new tab">
            <Image src={SRC} alt={ALT} width={1600} height={2160} unoptimized />
          </a>
          <figcaption>Tap the picture to open it full size.</figcaption>
        </figure>
        <div className="dr-about-text">
          <ul className="dr-facts">
            {FACTS.map((fact) => (
              <li key={fact.title}>
                <b>{fact.big}</b>
                <span>
                  <strong>{fact.title}</strong>
                  {fact.text}
                </span>
              </li>
            ))}
          </ul>
          <details className="dr-rules">
            <summary>Points and tie-breakers</summary>
            <div>
              <p>
                Win <b>{POINTS.win}</b> · Tie or no result <b>{POINTS.tie}</b> each · Loss <b>{POINTS.loss}</b>
              </p>
              <ol>
                {TIE_BREAKERS.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
