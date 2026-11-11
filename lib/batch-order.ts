// Client-safe. Teams are listed oldest batch first: by the year the batch joined, then the year it left, then by name.
// Teams with no batch on record go last.

export type BatchKey = { name: string; admission?: number | null; leaving?: number | null };

const year = (value: number | null | undefined): number => (typeof value === "number" ? value : Number.POSITIVE_INFINITY);
const order = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1);

export function compareBatch(a: BatchKey, b: BatchKey): number {
  return order(year(a.admission), year(b.admission)) || order(year(a.leaving), year(b.leaving)) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** SQL for the same order, for queries over `registrations` (or a view with the same batch columns). */
export const BATCH_ORDER_SQL = "batch_admission_year asc nulls last, batch_leaving_year asc nulls last, lower(team_name)";
