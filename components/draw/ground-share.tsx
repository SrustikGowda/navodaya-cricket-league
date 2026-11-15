import { groundSplitText, type GroundSplit } from "@/lib/draw/grounds";

/** A team's league grounds as small tiles: a gold A for each match on Ground A, a plain B for each on Ground B. */
export function GroundTiles({ split, className }: { split: GroundSplit; className?: string }) {
  const text = groundSplitText(split);
  return (
    <span className={className ? `dr-gt ${className}` : "dr-gt"} title={`League matches: ${text}`}>
      <span className="dr-sr">League matches: {text}.</span>
      {Array.from({ length: split.A }, (_, index) => (
        <i key={`a${index}`} className="is-a" aria-hidden="true">
          A
        </i>
      ))}
      {Array.from({ length: split.B }, (_, index) => (
        <i key={`b${index}`} className="is-b" aria-hidden="true">
          B
        </i>
      ))}
    </span>
  );
}

/** One line explaining the tiles, shown once under the group cards. */
export function GroundLegend() {
  return (
    <p className="dr-gt-legend">
      <span className="dr-gt" aria-hidden="true">
        <i className="is-a">A</i>
        <i className="is-b">B</i>
      </span>
      <span>League matches on Ground A and Ground B. Every team plays at least one on each ground.</span>
    </p>
  );
}
