import type { GroupCode, SeedRole } from "@/lib/draw/types";

const LEFT = [1, 2, 3] as const;
const RIGHT = [4, 5, 6] as const;
const ROW_Y = [14, 80, 146] as const;
const NODE_H = 36;
const LEFT_X = 6;
const RIGHT_X = 244;
const NODE_W = 110;

function clip(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/**
 * One group: sub-pool 1 on the left, sub-pool 2 on the right, and nine lines because every team in one
 * sub-pool plays each of the three teams in the other. Works as the explanatory diagram (slot codes only)
 * and as the fixture-creation view (team names, seeded teams marked, lines drawn one by one).
 * Pure SVG with no state, so it renders on the server and inside the animated stage alike.
 */
export function PoolDiagram({
  group,
  names,
  seeds,
  drawLines = false,
  label,
  opener,
}: {
  group: GroupCode;
  /** Slot code (A1..A6) to team name. */
  names?: Record<string, string>;
  seeds?: Record<string, SeedRole>;
  /** Animate the lines in sequence. */
  drawLines?: boolean;
  label?: string;
  /** Slot codes of the opening match, highlighted. */
  opener?: [string, string];
}) {
  const centerY = (row: number) => (ROW_Y[row] as number) + NODE_H / 2;
  const lines = LEFT.flatMap((from, fi) =>
    RIGHT.map((to, ti) => ({ from, to, fi, ti, id: `${group}${from}-${group}${to}` })),
  );
  const named = Boolean(names);
  return (
    <svg
      className={drawLines ? "dr-pool-svg dr-pool-svg--draw" : "dr-pool-svg"}
      viewBox="0 0 360 192"
      role="img"
      aria-label={label ?? `Group ${group}: each of the three teams in sub-pool 1 plays each of the three teams in sub-pool 2`}
    >
      <g className="dr-lines" aria-hidden="true">
        {lines.map((line, index) => {
          const isOpener = opener && opener.includes(`${group}${line.from}`) && opener.includes(`${group}${line.to}`);
          return (
            <line
              key={line.id}
              className={isOpener ? "dr-line dr-line--opener" : "dr-line"}
              data-from={line.from}
              data-to={line.to}
              style={{ ["--i" as string]: index }}
              x1={LEFT_X + NODE_W}
              y1={centerY(line.fi)}
              x2={RIGHT_X}
              y2={centerY(line.ti)}
              pathLength={1}
            />
          );
        })}
      </g>
      {[...LEFT, ...RIGHT].map((slot, index) => {
        const left = index < 3;
        const row = index % 3;
        const x = left ? LEFT_X : RIGHT_X;
        const y = ROW_Y[row] as number;
        const code = `${group}${slot}`;
        const seed = seeds?.[code];
        const name = names?.[code];
        return (
          <g key={code} className={seed ? "dr-node dr-node--seed" : "dr-node"} data-n={slot} tabIndex={named ? undefined : 0}>
            <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={9} />
            {named ? (
              <>
                <text className="dr-node-code" x={x + 10} y={y + NODE_H / 2 + 4}>{code}</text>
                <text className="dr-node-name" x={x + 34} y={y + NODE_H / 2 + 4.5}>{clip(name ?? "", 13)}</text>
                {name ? <title>{`${code} · ${name}`}</title> : null}
              </>
            ) : (
              <text className="dr-node-big" x={x + NODE_W / 2} y={y + NODE_H / 2 + 6} textAnchor="middle">{code}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
