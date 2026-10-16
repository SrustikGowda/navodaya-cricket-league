export type Actor = {
  id: string;
  email: string;
  role: "captain" | "organizer";
  displayName: string | null;
};

export type PlayerInput = {
  name: string;
  batchLabel?: string | null;
  role: "batter" | "bowler" | "all_rounder" | "wicket_keeper";
  jerseyNumber?: number | null;
  cricheroesUrl?: string | null;
};

export const PLAYER_ROLES = ["batter", "bowler", "all_rounder", "wicket_keeper"] as const;
export const PLATFORM_PLAYER_CAP = 40;
