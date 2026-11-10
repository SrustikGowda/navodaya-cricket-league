// Award shapes and labels. Client-safe: nothing here touches the database.

export type AwardEntry = { name: string; team: string; figure: string; details: string };
export type Awards = { batter: AwardEntry; bowler: AwardEntry; mvp: AwardEntry; fielder: AwardEntry };
export const AWARD_KEYS = ["batter", "bowler", "mvp", "fielder"] as const;

export const LABELS: Record<(typeof AWARD_KEYS)[number], string> = {
  batter: "Best batter",
  bowler: "Best bowler",
  mvp: "Most valuable player",
  fielder: "Best fielder",
};

const BLANK: AwardEntry = { name: "", team: "", figure: "", details: "" };

export function emptyAwards(): Awards {
  return { batter: { ...BLANK }, bowler: { ...BLANK }, mvp: { ...BLANK }, fielder: { ...BLANK } };
}
