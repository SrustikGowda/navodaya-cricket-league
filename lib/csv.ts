export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const errors: string[] = [];
  const grid = tokenize(text);
  if (grid.length === 0) return { rows: [], errors: ["The CSV is empty."] };
  const headers = grid[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  if (headers.some((header) => !header)) errors.push("The header row has an empty column.");
  const rows: CsvRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const line = grid[index] ?? [];
    if (line.every((cell) => cell.trim() === "")) continue;
    if (line.length !== headers.length) {
      errors.push(`Row ${index + 1} has ${line.length} columns; the header has ${headers.length}.`);
      continue;
    }
    const row: CsvRow = {};
    headers.forEach((header, cell) => {
      row[header] = (line[cell] ?? "").trim();
    });
    rows.push(row);
  }
  return { rows, errors };
}

function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim() !== ""));
}

export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map((value) => escape(value ?? "")).join(","))].join(
    "\n",
  );
}
