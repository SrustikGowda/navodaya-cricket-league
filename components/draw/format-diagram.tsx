import { PoolDiagram } from "./pool-diagram";
import { POINTS, TIE_BREAKERS } from "@/lib/draw/config";
import { SEED_DESCRIPTIONS } from "@/lib/draw/bracket";

const FLOW = [
  { n: "18", title: "Teams", note: "All approved teams" },
  { n: "3", title: "Groups", note: "A · B · C, six teams each", sub: "League · 6 overs" },
  { n: "8", title: "Qualify", note: "", chips: ["6 direct", "2 wildcards"] },
  { n: "4", title: "Quarterfinals", note: "6 overs a side" },
  { n: "2", title: "Semifinals", note: "8 overs a side" },
  { n: "1", title: "Final", note: "8 overs a side" },
] as const;

function Arrow() {
  return (
    <svg className="dr-arrow" viewBox="0 0 44 16" aria-hidden="true">
      <path d="M2 8h36M31 2l7 6-7 6" />
    </svg>
  );
}

/** Section A: the whole tournament in one picture. Server-rendered HTML and SVG; no script required. */
export function FormatDiagram() {
  return (
    <section className="dr-section dr-format" aria-labelledby="dr-format-title" id="format">
      <header className="dr-section-head">
        <p className="dr-eyebrow">Tournament format</p>
        <h2 id="dr-format-title">18 teams. 34 matches. One champion.</h2>
      </header>

      <ol className="dr-flow" aria-label="Tournament flow">
        {FLOW.map((node, index) => (
          <li className="dr-flow-item" key={node.title}>
            <div className="dr-flow-node">
              <span className="dr-flow-n">{node.n}</span>
              <span className="dr-flow-title">{node.title}</span>
              {"chips" in node ? (
                <span className="dr-flow-chips">
                  {node.chips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </span>
              ) : (
                <span className="dr-flow-note">{node.note}</span>
              )}
              {"sub" in node ? <span className="dr-flow-sub">{node.sub}</span> : null}
            </div>
            {index < FLOW.length - 1 ? <Arrow /> : null}
          </li>
        ))}
      </ol>

      <div className="dr-subhead">
        <h3>Inside every group</h3>
        <p>
          Six teams, two sub-pools of three. Each team plays all three teams in the <strong>opposite</strong> sub-pool and nobody in its own: three matches each,
          nine per group, <strong>27 in the league</strong>.
        </p>
      </div>

      <div className="dr-groups">
        <input className="dr-gp-radio" type="radio" name="dr-gp" id="dr-gp-a" defaultChecked aria-label="Show Group A" />
        <input className="dr-gp-radio" type="radio" name="dr-gp" id="dr-gp-b" aria-label="Show Group B" />
        <input className="dr-gp-radio" type="radio" name="dr-gp" id="dr-gp-c" aria-label="Show Group C" />
        <div className="dr-gp-tabs" role="presentation">
          {(["a", "b", "c"] as const).map((code) => (
            <label key={code} htmlFor={`dr-gp-${code}`}>Group {code.toUpperCase()}</label>
          ))}
        </div>
        <div className="dr-gp-grid">
          {(["A", "B", "C"] as const).map((group) => (
            <figure className="dr-pool" data-g={group} key={group}>
              <figcaption>
                <strong>Group {group}</strong>
                <span>9 matches</span>
              </figcaption>
              <div className="dr-pool-cols" aria-hidden="true">
                <span>Sub-pool 1</span>
                <span>Sub-pool 2</span>
              </div>
              <PoolDiagram group={group} />
              <p className="dr-pool-key">
                {group}1 · {group}2 · {group}3 each play {group}4 · {group}5 · {group}6
              </p>
            </figure>
          ))}
        </div>
      </div>

      <div className="dr-subhead">
        <h3>Who reaches the quarterfinals</h3>
      </div>
      <div className="dr-qual">
        <div className="dr-qual-card">
          <b>6</b>
          <span>Direct</span>
          <p>The top 2 of Group A, Group B and Group C.</p>
        </div>
        <div className="dr-qual-plus" aria-hidden="true">+</div>
        <div className="dr-qual-card dr-qual-card--wild">
          <b>2</b>
          <span>Wildcards</span>
          <p>The best 2 of the 3 third-placed teams, ranked by points, then net run rate.</p>
        </div>
        <div className="dr-qual-plus" aria-hidden="true">=</div>
        <div className="dr-qual-card dr-qual-card--total">
          <b>8</b>
          <span>Quarterfinalists</span>
          <p>Seeded 1–3 group winners, 4–6 runners-up, 7–8 wildcards.</p>
        </div>
      </div>
      <p className="dr-pairs">
        <span>Quarterfinals</span>
        <b>1 v 8</b>
        <b>4 v 5</b>
        <b>2 v 7</b>
        <b>3 v 6</b>
        <small>Two teams from the same group are kept apart wherever the seeds allow.</small>
      </p>

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
          <p className="dr-rules-seeds">
            {Object.entries(SEED_DESCRIPTIONS)
              .map(([seed, text]) => `Seed ${seed}: ${text}`)
              .join(" · ")}
          </p>
        </div>
      </details>
    </section>
  );
}
