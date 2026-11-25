"use client";

import { useState } from "react";
import { GROUND_NAMES } from "@/lib/draw/config";
import { canRearrangeMatch, putMatchInSlot, teamRestGaps, type ScheduleMatch, type ScheduleMove } from "@/lib/draw/schedule-editor";
import type { TeamRef } from "@/lib/draw/types";
import { checkSchedule, clock } from "@/lib/draw/validate";
import { AdminFeedback } from "../admin-post";
import { postJson } from "../post-json";
import styles from "./schedule-editor.module.css";

const grounds = ["A", "B"] as const;
const dragType = "application/x-ncl-match-slot";
const weekdays = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long" });
const dates = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "long" });
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

function restLabel(minutes: number): string {
  const length = Math.abs(minutes);
  const hours = Math.floor(length / 60);
  const rest = length % 60;
  const time = hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
  return minutes < 0 ? `${time} overlap` : `${time} rest`;
}

type Props = { drawId: string; days: string[]; matches: ScheduleMatch[]; teams: TeamRef[] };

export function ScheduleEditor({ drawId, days, matches, teams }: Props) {
  const [slots, setSlots] = useState(matches);
  const [occupants, setOccupants] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const entries = slots.map((slot) => {
    const occupant = byId.get(occupants[slot.id] ?? slot.id) ?? slot;
    return { slot, match: putMatchInSlot(occupant, slot) };
  });
  const moves: ScheduleMove[] = entries.flatMap(({ slot, match }) => match.id === slot.id ? [] : [{ fixtureId: match.id, slotId: slot.id, version: match.version }]);
  const arranged = entries.map(({ match }) => match);
  const conflicts = moves.length ? [...new Set(checkSchedule(arranged).errors)] : [];
  const active = selected ? entries.find(({ slot }) => slot.id === selected)?.match : null;
  const roster = [...teams].sort((a, b) => a.name.localeCompare(b.name, "en-IN", { numeric: true }));
  const rest = teamRestGaps(roster, arranged).filter(({ team }) => team.name.toLowerCase().includes(filter.trim().toLowerCase()));

  function swap(from: string, to: string) {
    if (pending || from === to || !byId.has(from) || !byId.has(to)) return;
    const first = byId.get(occupants[from] ?? from);
    const second = byId.get(occupants[to] ?? to);
    if (!first || !second || !canRearrangeMatch(first) || !canRearrangeMatch(second)) return;
    setOccupants((current) => ({ ...current, [from]: current[to] ?? to, [to]: current[from] ?? from }));
    setSelected(null);
    setMessage("");
    setError("");
  }

  async function publish() {
    if (pending || moves.length < 2 || conflicts.length) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await postJson("/api/admin", { action: "draw-reorder-schedule", drawId, moves });
      if (!Array.isArray(result.matches)) throw new Error("Reload this page to confirm the published schedule.");
      setSlots(result.matches as ScheduleMatch[]);
      setOccupants({});
      setSelected(null);
      setMessage(`Published. The public schedule now shows the new slots for ${moves.length} matches.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The schedule could not be published.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.editor}>
      <header className={styles.heading}>
        <h1>Edit match schedule</h1>
        <p className="quiet">Drag a match onto another to swap their slots. On touch or keyboard, select two matches. Every match keeps its opponents.</p>
        <nav className={styles.jumps} aria-label="Schedule sections">
          {days.map((day) => <a key={day} href={`#schedule-${day}`}>{weekdays.format(dateOf(day))}</a>)}
          <a href="#team-rest-gaps">Team rest gaps</a>
        </nav>
      </header>

      <div className={styles.board}>
        <div className={styles.toolbar}>
          <p role="status" aria-live="polite">
            {active ? `${active.code} selected. Choose another match to swap.` : moves.length ? `${moves.length} matches moved · ${conflicts.length ? "resolve conflicts before publishing" : "ready to publish"}` : "Published schedule · all times IST"}
          </p>
          <div className={styles.actions}>
            {selected ? <button type="button" className="button secondary" onClick={() => setSelected(null)}>Cancel selection</button> : null}
            {moves.length ? <button type="button" className="button secondary" disabled={pending} onClick={() => { setOccupants({}); setSelected(null); setError(""); }}>Reset swaps</button> : null}
            <button type="button" className="button gold" disabled={pending || moves.length < 2 || conflicts.length > 0} onClick={() => void publish()}>
              {pending ? "Publishing…" : "Publish schedule"}
            </button>
          </div>
        </div>

        <AdminFeedback message={message} error={error} />
        {conflicts.length ? (
          <div className={`alert ${styles.conflicts}`} role="status">
            <strong>Schedule conflicts</strong>
            <ul>{conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>
          </div>
        ) : null}

        <div className={styles.days}>
          {days.map((day) => {
            const dayEntries = entries.filter(({ slot }) => slot.date === day);
            const times = [...new Set(dayEntries.map(({ slot }) => slot.startMinutes))].sort((a, b) => a - b);
            return (
              <section key={day} id={`schedule-${day}`} className={styles.day} aria-labelledby={`schedule-title-${day}`}>
                <header className={styles.dayHeading}>
                  <h2 id={`schedule-title-${day}`}>{weekdays.format(dateOf(day))}</h2>
                  <span>{dates.format(dateOf(day))} · {dayEntries.length} matches</span>
                </header>
                <div className={`${styles.slotRow} ${styles.grounds}`} aria-hidden="true">
                  <span>Time</span><span>Ground A</span><span>Ground B</span>
                </div>
                {times.map((minutes) => (
                  <div key={minutes} className={styles.slotRow}>
                    <time className={styles.time}>{clock(minutes)}</time>
                    {grounds.map((ground) => {
                      const entry = dayEntries.find(({ slot }) => slot.startMinutes === minutes && slot.ground === ground);
                      if (!entry) return <span className={styles.emptySlot} key={ground} aria-hidden="true">—</span>;
                      const { slot, match } = entry;
                      const locked = !canRearrangeMatch(match);
                      const name = `${match.code}, ${match.teamALabel} vs ${match.teamBLabel}, ${weekdays.format(dateOf(day))} ${clock(minutes)}, ${GROUND_NAMES[ground]}`;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          className={styles.match}
                          data-code={match.code}
                          data-moved={slot.id !== match.id || undefined}
                          aria-label={locked ? `${name}, ${match.status.replaceAll("_", " ")}, locked` : name}
                          aria-pressed={selected === slot.id}
                          disabled={locked || pending}
                          draggable={!locked && !pending}
                          onClick={() => {
                            if (selected && selected !== slot.id) swap(selected, slot.id);
                            else setSelected(selected === slot.id ? null : slot.id);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(dragType, slot.id);
                            event.dataTransfer.effectAllowed = "move";
                            setSelected(null);
                            setDragging(slot.id);
                          }}
                          onDragEnd={() => setDragging(null)}
                          onDragOver={(event) => {
                            if (!locked && dragging && dragging !== slot.id) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = event.dataTransfer.getData(dragType);
                            if (from === dragging) swap(from, slot.id);
                            setDragging(null);
                          }}
                        >
                          <span className={styles.matchMeta}><b>{match.code}</b>{locked ? <span>{match.status.replaceAll("_", " ")}</span> : <span aria-hidden="true">⠿</span>}</span>
                          <span className={styles.teams}><span>{match.teamALabel}</span><span><small>vs</small> {match.teamBLabel}</span></span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>

      <section id="team-rest-gaps" className={styles.rest} aria-labelledby="team-rest-title">
        <div className={styles.restHeader}>
          <div><h2 id="team-rest-title">Team rest gaps</h2><p className="quiet">Scheduled finish to next start, including overnight. Knockouts appear once the teams are known.</p></div>
          <label className="field">Filter teams<input className="text-input" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        </div>
        {rest.length === 0 ? <p>No teams match your search.</p> : null}
        <div className={styles.restGrid}>
          {rest.map(({ team, matches: own, gaps }) => (
            <article key={team.id} className={styles.team}>
              <h3>{team.name} <span>{own.length} {own.length === 1 ? "match" : "matches"}</span></h3>
              {gaps.length ? (
                <ul>
                  {gaps.map(({ before, after, minutes, short }) => (
                    <li key={`${before.id}-${after.id}`}>
                      <span>{weekdays.format(dateOf(before.date)).slice(0, 3)} {before.code} → {weekdays.format(dateOf(after.date)).slice(0, 3)} {after.code}</span>
                      <strong className={short ? styles.shortRest : undefined}>{restLabel(minutes)}{short && minutes >= 0 ? " · short" : ""}</strong>
                    </li>
                  ))}
                </ul>
              ) : <p className="quiet">No gap to measure yet.</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
