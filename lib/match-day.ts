import type { PublicFixture } from "./public-data";

export type GroundBoard = {
  ground: string;
  now: PublicFixture[];
  next: PublicFixture | null;
  later: PublicFixture[];
};

export function buildMatchDay(fixtures: PublicFixture[], now = new Date()): { grounds: GroundBoard[]; updatedAt: string | null } {
  const names = [...new Set(fixtures.map((fixture) => fixture.groundName || "Ground to be announced"))];
  const grounds = names.map((ground) => {
    const matches = fixtures
      .filter((fixture) => (fixture.groundName || "Ground to be announced") === ground)
      .filter((fixture) => fixture.status !== "cancelled")
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const current = matches.filter((fixture) => isCurrent(fixture, now));
    const upcoming = matches.filter((fixture) => fixture.startsAt && new Date(fixture.startsAt).getTime() > now.getTime() && !current.includes(fixture) && fixture.status !== "completed" && fixture.status !== "abandoned");
    return {
      ground,
      now: current,
      next: upcoming[0] ?? null,
      later: upcoming.slice(1),
    };
  });
  const updatedAt = fixtures.reduce<string | null>((latest, fixture) => {
    if (!fixture.updatedAt) return latest;
    if (!latest || fixture.updatedAt > latest) return fixture.updatedAt;
    return latest;
  }, null);
  return { grounds, updatedAt };
}

function isCurrent(fixture: PublicFixture, now: Date): boolean {
  if (fixture.status === "in_progress") return true;
  if (!fixture.startsAt || fixture.durationMinutes == null) return false;
  if (fixture.status !== "scheduled" && fixture.status !== "delayed") return false;
  const start = new Date(fixture.startsAt).getTime();
  const end = start + fixture.durationMinutes * 60_000;
  const time = now.getTime();
  return time >= start && time < end;
}
