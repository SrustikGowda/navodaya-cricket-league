"use client";

import { useSyncExternalStore } from "react";
import { formatIst } from "@/lib/format";

type Fixture = {
  id: string;
  teamALabel: string;
  teamBLabel: string;
  teamAId: string | null;
  teamBId: string | null;
  startsAt: string | null;
  groundName: string | null;
  reportingAt: string | null;
  status: string;
  stage: string;
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return window.localStorage.getItem("ncl-my-team");
}

export function rememberTeam(id: string, name: string) {
  window.localStorage.setItem("ncl-my-team", id);
  window.localStorage.setItem("ncl-my-team-name", name);
  listeners.forEach((listener) => listener());
}

export function clearTeam() {
  window.localStorage.removeItem("ncl-my-team");
  window.localStorage.removeItem("ncl-my-team-name");
  listeners.forEach((listener) => listener());
}

export function MyTeam({ fixtures, now }: { fixtures: Fixture[]; now: string }) {
  const slug = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!slug) return <p className="quiet">Choose My team on a team page. The choice stays on this device and does not need an account.</p>;
  const mine = fixtures.filter((fixture) => fixture.teamAId === slug || fixture.teamBId === slug || fixture.teamALabel === slug || fixture.teamBLabel === slug);
  const nowMs = new Date(now).getTime();
  const next = mine.find((fixture) => fixture.startsAt && new Date(fixture.startsAt).getTime() >= nowMs && fixture.status !== "completed" && fixture.status !== "cancelled");
  const recent = [...mine].reverse().find((fixture) => fixture.status === "completed");
  if (!next && !recent) return <p>No published match for your saved team yet.</p>;
  return (
    <div className="note">
      <p>My team</p>
      {next ? (
        <>
          <p><strong>{next.teamALabel} vs {next.teamBLabel}</strong></p>
          <p>{formatIst(next.startsAt)} · {next.groundName ?? "Ground to be announced"}</p>
          {next.reportingAt ? <p>Report by {formatIst(next.reportingAt)}</p> : null}
        </>
      ) : null}
      {recent ? <p>Recent result: {recent.teamALabel} vs {recent.teamBLabel} · {recent.status}</p> : null}
      <button className="button secondary" type="button" onClick={clearTeam}>Clear my team</button>
    </div>
  );
}

export function RememberTeam({ id, name }: { id: string; name: string }) {
  return (
    <button className="button secondary" type="button" onClick={() => rememberTeam(id, name)}>
      This is my team
    </button>
  );
}
