import type { Queryable } from "../db";
import { getActiveSeason } from "../season";
import { getOfficialDraw, liveFixtures, loadQualification, publicTeams } from "./service";
import type { Qualification } from "./standings";
import type { LiveFixture, OfficialDrawView, PublicTeam } from "./types";

export type DrawBoard = {
  official: OfficialDrawView | null;
  fixtures: LiveFixture[];
  qualification: Qualification | null;
  teams: PublicTeam[];
  serverTime: string;
};

/** Everything the Fixtures page shows for a published draw, read in one place for the page and the API. */
export async function loadBoard(db: Queryable): Promise<DrawBoard> {
  const season = await getActiveSeason(db);
  const [official, teams] = await Promise.all([getOfficialDraw(db), publicTeams(db, season.id)]);
  if (!official) return { official: null, fixtures: [], qualification: null, teams, serverTime: new Date().toISOString() };
  const [fixtures, qualification] = await Promise.all([liveFixtures(db, official.id), loadQualification(db, official)]);
  return { official, fixtures, qualification, teams, serverTime: new Date().toISOString() };
}
