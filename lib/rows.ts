export type Row = Record<string, unknown>;

export function str(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function dateOnly(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (value instanceof Date) {
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

export function num(row: Row, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bool(row: Row, key: string): boolean {
  const value = row[key];
  return value === true || value === "t" || value === "true" || value === 1;
}

export function requiredStr(row: Row, key: string): string {
  return str(row, key) ?? "";
}
