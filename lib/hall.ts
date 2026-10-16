export type Innings = { name: string; score: string; overs: string };

export type Standout = {
  name: string;
  team: string | null;
  figure: string;
  unit: string;
  details: string | null;
};

export type HallEdition = {
  editionNumber: number;
  year: number;
  roman: string;
  championName: string;
  championBatch: string | null;
  monogram: string;
  runnerName: string;
  runnerBatch: string | null;
  final: {
    date: string | null;
    first: Innings | null;
    second: Innings | null;
    result: string;
    venue: string | null;
    summary: string;
  };
  standouts: {
    runs: Standout | null;
    wickets: Standout | null;
    mvp: { name: string; rank: number | null; note: string | null } | null;
    fielder: Standout | null;
  };
  semis: string[];
  details: { label: string; value: string; plain?: boolean; note?: string | null }[];
  sourceUrl: string | null;
  scorecardUrl: string | null;
};

const ROMAN: Record<number, string> = { 12: "XII", 13: "XIII", 14: "XIV" };

export function toHallEdition(entry: {
  editionNumber: number;
  year: number | null;
  champion: string | null;
  runnerUp: string | null;
  venueNote: string | null;
  notes: string | null;
  sourceUrl: string | null;
}): HallEdition {
  const fields = noteFields(entry.notes);
  const champion = splitTeam(entry.champion ?? "");
  const runner = splitTeam(entry.runnerUp ?? "");
  const final = parseFinal(fields.Final ?? "");
  const sourceUrl = entry.sourceUrl;
  return {
    editionNumber: entry.editionNumber,
    year: entry.year ?? 0,
    roman: ROMAN[entry.editionNumber] ?? String(entry.editionNumber),
    championName: champion.name,
    championBatch: champion.batch,
    monogram: monogram(champion.name),
    runnerName: runner.name,
    runnerBatch: runner.batch,
    final,
    standouts: {
      runs: parseStat(fields["Leading run-scorer"] ?? "", "runs"),
      wickets: parseStat(fields["Leading wicket-taker"] ?? "", "wickets"),
      mvp: parseMvp(fields["Most valuable player"] ?? ""),
      fielder: parseStat(fields["Leading fielder"] ?? "", "dismissals"),
    },
    semis: parseSemis(fields["Semi-finals"] ?? ""),
    details: [
      fields.Dates ? { label: "Dates", value: fields.Dates, plain: true } : null,
      entry.venueNote ? { label: "Venue", value: entry.venueNote, plain: true } : null,
      fields.Ball ? { label: "Ball", value: fields.Ball } : null,
      teamDetail(fields.Teams),
      fields.Matches ? { label: "Matches", value: fields.Matches } : null,
    ].filter((item): item is { label: string; value: string; plain?: boolean; note?: string | null } => item != null),
    sourceUrl,
    scorecardUrl: sourceUrl?.includes("/scorecard/") ? sourceUrl : null,
  };
}

function noteFields(notes: string | null) {
  const fields: Record<string, string> = {};
  for (const line of (notes ?? "").split("\n")) {
    const splitAt = line.indexOf(": ");
    if (splitAt === -1) continue;
    fields[line.slice(0, splitAt).trim()] = line.slice(splitAt + 2).trim();
  }
  return fields;
}

function splitTeam(value: string) {
  const match = value.match(/^(.*?)\s+\(([^)]+)\)\s*$/);
  if (!match) return { name: value, batch: null };
  return { name: match[1], batch: match[2] };
}

function monogram(name: string) {
  const words = name.split(/[\s-]+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function parseFinal(value: string): HallEdition["final"] {
  const summary = value.trim();
  const match = summary.match(
    /^(.+?) beat (.+?) by (.+?)(?: on ([^.]+))?\.\s+(.+?) made (\d+\/\d+) in ([0-9.]+) overs and (.+?) (?:finished on|were) (\d+\/\d+) in ([0-9.]+) overs at (.+?)\.?$/,
  );
  if (!match) {
    return { date: null, first: null, second: null, result: summary, venue: null, summary };
  }
  return {
    date: match[4]?.trim() ?? null,
    first: { name: match[5], score: match[6], overs: `${match[7]} ov` },
    second: { name: match[8], score: match[9], overs: `${match[10]} ov` },
    result: `${match[1]} won by ${match[3].trim()}`,
    venue: match[11].replace(/\.$/, ""),
    summary,
  };
}

function parseSemis(value: string) {
  return value
    .split(/\.\s+/)
    .map((part) => part.replace(/\.$/, "").trim())
    .filter((part) => part.includes(" beat "));
}

function parseStat(value: string, unit: string): Standout | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const name = parts[0] ?? "";
  const rest = parts.slice(1);
  const statIndex = rest.findIndex((part) => new RegExp(`\\d+\\s+${unit}\\b`, "i").test(part));
  const team = statIndex > 0 ? rest.slice(0, statIndex).join(", ") : statIndex === 0 ? null : rest[0] && !/\d/.test(rest[0]) ? rest[0] : null;
  const statText = (statIndex >= 0 ? rest.slice(statIndex) : rest).join(", ");
  const figure = statText.match(new RegExp(`(\\d+)\\s+${unit}\\b`, "i"));
  if (!figure) return { name, team, figure: "", unit, details: statText || null };
  const details = statText.slice(figure.index! + figure[0].length).replace(/^[, ]+/, "").replace(/\.$/, "").trim();
  return {
    name,
    team,
    figure: figure[1],
    unit,
    details: details || null,
  };
}

function teamDetail(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d+)(?:,\s*(.+))?$/);
  if (!match) return { label: "Teams", value };
  return { label: "Teams", value: match[1], note: match[2] ?? null };
}

function parseMvp(value: string): HallEdition["standouts"]["mvp"] {
  if (!value) return null;
  const [headline, ...notes] = value.split(/\.\s+/);
  const comma = headline.indexOf(", ");
  const name = comma === -1 ? headline : headline.slice(0, comma);
  const distinction = comma === -1 ? "" : headline.slice(comma + 2).trim();
  const note = notes.join(". ").replace(/\.$/, "").trim();
  const rank = /top of the cricheroes tournament mvp table/i.test(distinction) ? 1 : null;
  return { name, rank, note: note || null };
}
