"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HallEdition } from "@/lib/hall";

export function HallOfChampions({ editions, year }: { editions: HallEdition[]; year: number }) {
  const router = useRouter();
  const keyboard = useRef(false);
  const selected = editions.find((edition) => edition.year === year) ?? editions[0];

  useEffect(() => {
    if (!keyboard.current || !selected) return;
    document.getElementById(`hall-tab-${selected.year}`)?.focus();
    keyboard.current = false;
  }, [selected]);

  if (!selected) return null;

  function move(event: React.KeyboardEvent<HTMLDivElement>) {
    const order = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!order.includes(event.key) || editions.length === 0) return;
    event.preventDefault();
    const index = Math.max(0, editions.findIndex((edition) => edition.year === selected.year));
    const next = event.key === "Home" ? 0 : event.key === "End" ? editions.length - 1 : event.key === "ArrowRight" ? (index + 1) % editions.length : (index - 1 + editions.length) % editions.length;
    keyboard.current = true;
    router.push(`/history?year=${editions[next].year}`);
  }

  return (
    <div className="hall">
      <div className="hall-tabs" role="tablist" aria-label="Editions" onKeyDown={move}>
        {editions.map((edition) => {
          const active = edition.year === selected.year;
          return (
            <Link
              key={edition.year}
              id={`hall-tab-${edition.year}`}
              role="tab"
              href={`/history?year=${edition.year}`}
              aria-selected={active}
              aria-controls="hall-panel"
              tabIndex={active ? 0 : -1}
            >
              {edition.year} · {edition.roman}
            </Link>
          );
        })}
      </div>
      <div key={selected.year} id="hall-panel" role="tabpanel" aria-labelledby={`hall-tab-${selected.year}`} className="hall-panel">
        <div className="hall-feature">
          <article className="hall-champion">
            <span className="hall-numeral" aria-hidden="true">{selected.roman}</span>
            <p className="hall-kicker">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v3a5 5 0 0 1-10 0V4z" /><path d="M7 6H5a3 3 0 0 0 3 4M17 6h2a3 3 0 0 1-3 4M8 20h8M12 12v4" /></svg>
              Champions
            </p>
            <div className="hall-identity">
              <span className="hall-mono" aria-hidden="true">{selected.monogram}</span>
              <div>
                <h2>{selected.championName}</h2>
                {selected.championBatch ? <p>{selected.championBatch}</p> : null}
              </div>
            </div>
            {selected.runnerName ? <p className="hall-runner">Runner-up {selected.runnerName}{selected.runnerBatch ? ` · ${selected.runnerBatch}` : ""}</p> : null}
          </article>
          <article className="hall-final">
            <p className="hall-kicker">Final{selected.final.date ? ` · ${selected.final.date}` : ""}</p>
            {selected.final.first && selected.final.second ? (
              <div className="hall-score">
                <InningsLine innings={selected.final.first} />
                <InningsLine innings={selected.final.second} />
              </div>
            ) : (
              <p>{selected.final.summary}</p>
            )}
            {selected.final.first ? <p className="hall-result">{selected.final.result}</p> : null}
            {selected.final.venue ? <p className="hall-venue">{selected.final.venue}</p> : null}
            {selected.scorecardUrl ? <p><a href={selected.scorecardUrl}>View scorecard ↗</a></p> : null}
          </article>
        </div>
        <div className="hall-standouts">
          <StatCard title="Most runs" item={selected.standouts.runs} />
          <StatCard title="Most wickets" item={selected.standouts.wickets} />
          {selected.standouts.mvp ? (
            <article>
              <p>MVP leaderboard</p>
              <h3>{selected.standouts.mvp.name}</h3>
              {selected.standouts.mvp.rank === 1 ? <span className="hall-rank">Rank #1</span> : null}
              {selected.standouts.mvp.note ? <details><summary>Source note</summary><p>{selected.standouts.mvp.note}</p></details> : null}
            </article>
          ) : null}
          <StatCard title="Leading fielder" item={selected.standouts.fielder} />
        </div>
        {selected.semis.length > 0 ? (
          <details className="hall-semis">
            <summary>Semi-finals</summary>
            <div>
              {selected.semis.map((semi) => <article key={semi}><p>{semi}</p></article>)}
            </div>
          </details>
        ) : null}
        <section className="hall-details">
          <h3>Edition details</h3>
          <dl>
            {selected.details.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.plain ? "hall-plain" : undefined}>
                  {item.value}
                  {item.note ? <details><summary>Note</summary><p>{item.note}</p></details> : null}
                </dd>
              </div>
            ))}
          </dl>
          {selected.sourceUrl ? <p><a href={selected.sourceUrl}>Records on CricHeroes ↗</a></p> : null}
        </section>
      </div>
    </div>
  );
}

function InningsLine({ innings }: { innings: { name: string; score: string; overs: string } }) {
  return (
    <p>
      <span>{innings.name}</span>
      <b>{innings.score}<small>{innings.overs}</small></b>
    </p>
  );
}

function StatCard({ title, item }: { title: string; item: { name: string; team: string | null; figure: string; unit: string; details: string | null } | null }) {
  if (!item) return null;
  return (
    <article>
      <p>{title}</p>
      <h3>{item.name}</h3>
      {item.team ? <span>{item.team}</span> : null}
      {item.figure ? <strong>{item.figure} <small>{item.unit}</small></strong> : null}
      {item.details ? <details><summary>More stats</summary><p>{item.details}</p></details> : null}
    </article>
  );
}
