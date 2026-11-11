// Client-safe. One rule for a team's entry fee, used by the admin Payments list and the public team cards.

export type FeeStatus = "paid" | "unpaid" | "exempt" | "none";

/** Batches that passed out in this year or later do not pay the entry fee. */
export const FEE_FREE_FROM_YEAR = 2021;

/**
 * paid: an organizer ticked it. exempt: the batch left in 2021 or later. none: the season has no fee yet.
 * Otherwise unpaid. A team that has paid shows as paid even if its batch is exempt.
 */
export function feeStatusOf(input: { paid: boolean; leavingYear: number | null; feePaise: number | null }): FeeStatus {
  if (input.paid) return "paid";
  if (input.leavingYear != null && input.leavingYear >= FEE_FREE_FROM_YEAR) return "exempt";
  if (input.feePaise == null || input.feePaise <= 0) return "none";
  return "unpaid";
}
