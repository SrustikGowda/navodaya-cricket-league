import { MIN_KNOCKOUT_REST_MINUTES, MIN_LEAGUE_REST_MINUTES } from "./config";
import type { TeamRef } from "./types";
import { scheduleMinute, type TimedMatch } from "./validate";

export type ScheduleMatch = TimedMatch & {
  id: string;
  version: number;
  status: string;
  teamALabel: string;
  teamBLabel: string;
};

export type ScheduleMove = { fixtureId: string; slotId: string; version: number };

export function canRearrangeMatch(match: Pick<ScheduleMatch, "status">): boolean {
  return match.status === "scheduled" || match.status === "delayed";
}

export function putMatchInSlot(match: ScheduleMatch, slot: ScheduleMatch): ScheduleMatch {
  return { ...match, date: slot.date, startMinutes: slot.startMinutes, ground: slot.ground };
}

/** Rest is measured from the scheduled end of a match to the next start, including overnight. */
export function teamRestGaps(teams: TeamRef[], matches: ScheduleMatch[]) {
  const byTeam = new Map<string, ScheduleMatch[]>();
  const ordered = matches.filter((match) => match.status !== "cancelled").sort((a, b) => scheduleMinute(a) - scheduleMinute(b));
  for (const match of ordered) {
    for (const id of new Set(match.teams)) {
      const own = byTeam.get(id) ?? [];
      own.push(match);
      byTeam.set(id, own);
    }
  }
  return teams.map((team) => {
    const own = byTeam.get(team.id) ?? [];
    const gaps = own.slice(1).map((after, index) => {
      const before = own[index];
      const minutes = scheduleMinute(after) - scheduleMinute(before) - before.durationMinutes;
      const minimum = before.stage === "league" && after.stage === "league" ? MIN_LEAGUE_REST_MINUTES : MIN_KNOCKOUT_REST_MINUTES;
      return { before, after, minutes, short: minutes < minimum };
    });
    return { team, matches: own, gaps };
  });
}
