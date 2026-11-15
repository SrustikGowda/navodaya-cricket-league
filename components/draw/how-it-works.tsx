"use client";

import { useEffect, useRef, useState } from "react";
import { BYE_CODE, GROUP_TEAMS, LEAGUE_MATCHES_BY_GROUP, OPPONENT_TEMPLATE } from "@/lib/draw/config";
import { groundShareText, positionGroundSplit } from "@/lib/draw/grounds";
import { OpponentWeb } from "./group-views";

const GROUNDS = positionGroundSplit();

function sentence(code: string): string {
  const [first, second, third] = OPPONENT_TEMPLATE[code.startsWith("A") ? "A" : "B"][code] ?? [];
  const list = [first, second, third].filter(Boolean).map((position) => (position === BYE_CODE ? "a BYE" : position));
  const text = list.length === 3 ? `${list[0]}, ${list[1]} and ${list[2]}` : list.join(", ");
  const split = GROUNDS.get(code);
  const grounds = split ? ` ${split.A} on Ground A, ${split.B} on Ground B.` : "";
  return `${code} plays ${text}.${grounds}${code === "A1" ? " A1 v A2 is the opening match." : ""}`;
}

/**
 * The idea of the draw before it happens, using only positions. Teams are drawn into positions; every position then
 * plays the same three fixed opponents. The lines draw themselves when the section scrolls into view.
 */
export function HowFixturesWork() {
  const [focus, setFocus] = useState<string>("A1");
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pick = (code: string) => setFocus((current) => (current === code ? "" : code));
  return (
    <section className="dr-how" id="how" ref={ref} aria-labelledby="dr-how-title">
      <div className="dr-about-head">
        <h2 id="dr-how-title">How the fixtures are made</h2>
      </div>
      <p className="dr-how-lead">
        The draw puts teams into positions, A1, A2 and so on. Every position plays the same three opponents, so the draw decides who sits where, and the fixtures follow.
      </p>
      <div className="dr-how-grid">
        {(["A", "B"] as const).map((group) => {
          const active = focus.startsWith(group) ? focus : null;
          return (
            <figure className="dr-how-card" key={group}>
              <figcaption>
                <b>Group {group}</b>
                <span>
                  {GROUP_TEAMS[group]} teams{group === "A" ? " + 1 BYE" : ""} · {LEAGUE_MATCHES_BY_GROUP[group]} matches
                </span>
              </figcaption>
              <OpponentWeb group={group} opener={group === "A" ? ["A1", "A2"] : undefined} focus={active} animate={seen} hold={!seen} onPick={pick} />
              <p className="dr-how-line" aria-live="polite">
                {active ? sentence(active) : "Tap a position to see its three opponents."}
              </p>
            </figure>
          );
        })}
      </div>
      <p className="dr-how-foot">
        Each line is one match. The dashed green line is the BYE, a walkover worth 2 points that one team in Group A receives. The brighter line is the opening match, A1 v A2.
      </p>
      <p className="dr-how-foot">{groundShareText()}</p>
    </section>
  );
}
