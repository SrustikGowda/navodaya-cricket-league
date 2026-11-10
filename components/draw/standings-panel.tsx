"use client";

import { useMemo } from "react";
import type { Qualification } from "@/lib/draw/standings";
import type { PublicTeam } from "@/lib/draw/types";
import { StandingsBoard } from "./standings-board";

/** Server pages pass plain data; the board wants lookups. */
export function StandingsPanel({ qualification, roster, teams }: { qualification: Qualification; roster: { id: string; name: string }[]; teams: PublicTeam[] }) {
  const names = useMemo(() => new Map(roster.map((team) => [team.id, team.name])), [roster]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  return <StandingsBoard qualification={qualification} names={names} teams={teamMap} />;
}
