import Image from "next/image";
import { POINTS, TIE_BREAKERS } from "@/lib/draw/config";

const SRC = "/brand/ncl-2026-format-v1.png";

// Everything the picture says, in words, for screen readers and for anyone whose image does not load.
const ALT =
  "NCL 2026 tournament format. Three groups of six teams. Each group has two sub-pools of three, and every team plays all three teams in the opposite sub-pool: three league matches each, nine per group, 27 in the league. " +
  "The top 2 from each group (6 teams) and the best 2 third-placed teams (2 teams) make 8 quarterfinalists. " +
  "Quarterfinals are seed 1 v seed 8, seed 4 v seed 5, seed 2 v seed 7 and seed 3 v seed 6. The winners of quarterfinals 1 and 2 meet in semifinal 1, the winners of quarterfinals 3 and 4 meet in semifinal 2, and the two semifinal winners play the final. " +
  "27 league matches plus 7 knockouts make 34 matches. League and quarterfinals are 6 overs a side; semifinals and the final are 8 overs a side.";

/**
 * Section A: the tournament format picture supplied by the organizers, plus the published points and tie-breaker rules.
 * Served as the original file (it is only about 200 KB) so the small text stays sharp, and the same file opens full size on tap.
 */
export function FormatImage() {
  return (
    <section className="dr-section dr-format" aria-labelledby="dr-format-title" id="format">
      <h2 id="dr-format-title" className="dr-sr">
        NCL 2026 tournament format
      </h2>
      <a className="dr-format-img" href={SRC} target="_blank" rel="noopener noreferrer" aria-label="Open the tournament format picture full size, in a new tab">
        <Image src={SRC} alt={ALT} width={1600} height={2160} unoptimized priority />
      </a>
      <p className="dr-format-hint">Tap or click the picture to open it full size.</p>

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
    </section>
  );
}
