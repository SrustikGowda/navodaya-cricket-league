// Draws the groups and the two-day schedule as A4 pages on a canvas, and saves them as one PNG or a PDF. Client only.

import { BYE_CODE, OPPONENT_TEMPLATE } from "./config";
import type { DrawPlan } from "./types";
import { SEED_TEXT, slotCodeOf, timeText, type ViewBye, type ViewMatch } from "./view";

export type SheetData = {
  plan: DrawPlan;
  matches: ViewMatch[];
  bye: ViewBye;
  official: boolean;
  drawRef: string | null;
  names: Map<string, string>;
};

const W = 1240;
const H = 1754;
const GOLD = "#f0c862";
const GOLD_DEEP = "#c9971f";
const TEXT = "#f4efe4";
const MUTED = "#a9a18d";
const FONT = '"RPL Text", "Helvetica Neue", Arial, sans-serif';
const DISPLAY = '"RPL Display", "Helvetica Neue", Arial, sans-serif';

function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function page(data: SheetData, title: string, subtitle: string): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Your browser cannot create the file.");
  g.fillStyle = "#080808";
  g.fillRect(0, 0, W, H);
  const rail = g.createLinearGradient(0, 0, W, 0);
  rail.addColorStop(0, GOLD_DEEP);
  rail.addColorStop(0.5, GOLD);
  rail.addColorStop(1, GOLD_DEEP);
  g.fillStyle = rail;
  g.fillRect(0, 0, W, 12);
  g.fillStyle = GOLD;
  g.font = `700 26px ${FONT}`;
  g.fillText("NAVODAYA CRICKET LEAGUE 2026", 70, 80);
  g.fillStyle = MUTED;
  g.font = `500 24px ${FONT}`;
  g.fillText(data.official ? `Official draw${data.drawRef ? ` · ${data.drawRef}` : ""}` : "TRIAL DRAW · NOT OFFICIAL", 70, 114);
  g.fillStyle = TEXT;
  g.font = `900 64px ${DISPLAY}`;
  g.fillText(title, 70, 200);
  g.fillStyle = GOLD;
  g.font = `600 28px ${FONT}`;
  g.fillText(subtitle, 70, 244);
  g.fillStyle = MUTED;
  g.font = `500 22px ${FONT}`;
  g.fillText("navodaya-cricket-league.up.railway.app/2026/fixtures", 70, H - 56);
  if (!data.official) {
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-Math.PI / 7);
    g.font = `900 120px ${DISPLAY}`;
    g.textAlign = "center";
    g.fillStyle = "rgba(240,87,75,0.18)";
    g.fillText("TRIAL — NOT OFFICIAL", 0, 0);
    g.restore();
  }
  return { canvas, g };
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = "#12110d";
  g.strokeStyle = "rgba(240,200,98,0.28)";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x, y, w, h, 18);
  g.fill();
  g.stroke();
}

function groupsPage(data: SheetData): HTMLCanvasElement {
  const { canvas, g } = page(data, "Groups", "19 teams · Group A 9 + BYE · Group B 10");
  const by = new Map(data.plan.result.assignments.map((a) => [slotCodeOf(a), a]));
  const nameOf = (code: string) => (code === BYE_CODE ? "BYE" : data.names.get(by.get(code)?.teamId ?? "") ?? code);
  (["A", "B"] as const).forEach((group, column) => {
    const x = 70 + column * 560;
    const rows = Object.entries(OPPONENT_TEMPLATE[group]);
    const height = 96 + rows.length * 116 + (group === "A" ? 90 : 0);
    panel(g, x, 290, 540, height);
    g.fillStyle = GOLD;
    g.font = `900 46px ${DISPLAY}`;
    g.fillText(`Group ${group}`, x + 28, 350);
    g.fillStyle = MUTED;
    g.font = `500 24px ${FONT}`;
    g.fillText(group === "A" ? "9 teams + 1 BYE · 13 matches" : "10 teams · 15 matches", x + 28, 384);
    rows.forEach(([code, opponents], index) => {
      const y = 430 + index * 116;
      const a = by.get(code);
      g.fillStyle = GOLD;
      g.font = `800 26px ${FONT}`;
      g.fillText(code, x + 28, y + 30);
      g.fillStyle = TEXT;
      g.font = `700 30px ${FONT}`;
      g.fillText(fit(g, nameOf(code), 350), x + 100, y + 30);
      if (a?.seed) {
        g.fillStyle = GOLD;
        g.font = `600 20px ${FONT}`;
        g.textAlign = "right";
        g.fillText(SEED_TEXT[a.seed].toUpperCase(), x + 512, y + 30);
        g.textAlign = "left";
      }
      g.fillStyle = MUTED;
      g.font = `500 22px ${FONT}`;
      g.fillText(`vs ${opponents.map((o) => (o === BYE_CODE ? "BYE" : `${o}`)).join(" · ")}`, x + 100, y + 66);
      g.fillStyle = "rgba(240,200,98,0.12)";
      g.fillRect(x + 28, y + 90, 484, 1);
    });
    if (group === "A") {
      const y = 430 + rows.length * 116;
      g.fillStyle = "rgba(240,200,98,0.1)";
      g.beginPath();
      g.roundRect(x + 20, y - 4, 500, 74, 12);
      g.fill();
      g.fillStyle = GOLD;
      g.font = `800 24px ${FONT}`;
      g.fillText("BYE · A9", x + 36, y + 28);
      g.fillStyle = TEXT;
      g.font = `600 24px ${FONT}`;
      g.fillText(fit(g, `${data.bye.label} · 2 matches + 1 BYE`, 470), x + 36, y + 58);
    }
  });
  g.fillStyle = MUTED;
  g.font = `500 22px ${FONT}`;
  g.fillText("Every team plays 3 league fixtures. Only A9 has a BYE, a walkover worth 2 points.", 70, 1640);
  return canvas;
}

function dayPage(data: SheetData, day: 1 | 2): HTMLCanvasElement {
  const rows = data.matches.filter((m) => m.day === day);
  const slots = [...new Set(rows.map((m) => m.startMinutes))].sort((a, b) => a - b);
  const date = day === 1 ? "Saturday 28 November 2026" : "Sunday 29 November 2026";
  const { canvas, g } = page(data, day === 1 ? "Day 1 · Saturday" : "Day 2 · Sunday", date);
  const colW = 520;
  const top = 296;
  g.fillStyle = MUTED;
  g.font = `700 22px ${FONT}`;
  g.fillText("TIME", 70, top);
  g.fillText("GROUND A", 250, top);
  g.fillText("GROUND B", 250 + colW + 20, top);
  let y = top + 24;
  slots.forEach((minutes, index) => {
    const inSlot = rows.filter((m) => m.startMinutes === minutes);
    const previous = index > 0 ? (slots[index - 1] as number) : null;
    const rowH = 112;
    const knockout = inSlot.every((m) => m.stage !== "league");
    if (day === 1 && previous != null && !knockout && minutes - previous > 55) {
      g.fillStyle = "rgba(240,200,98,0.1)";
      g.beginPath();
      g.roundRect(70, y, W - 140, 56, 12);
      g.fill();
      g.fillStyle = GOLD;
      g.font = `700 24px ${FONT}`;
      g.fillText(`Inauguration break · ${timeText(previous + 55)} to ${timeText(minutes)}`, 96, y + 36);
      y += 72;
    }
    g.fillStyle = TEXT;
    g.font = `800 28px ${FONT}`;
    g.fillText(timeText(minutes), 70, y + 56);
    (["A", "B"] as const).forEach((ground, position) => {
      const x = 250 + position * (colW + 20);
      const match = inSlot.find((m) => m.ground === ground);
      panel(g, x, y, colW, rowH - 12);
      if (!match) return;
      g.fillStyle = match.number === 1 || match.stage !== "league" ? GOLD : MUTED;
      g.font = `700 20px ${FONT}`;
      const label = match.stage === "league" ? `M${match.number} · GROUP ${match.group}` : match.code === "F" ? "FINAL" : match.code;
      g.fillText(label, x + 22, y + 32);
      g.fillStyle = TEXT;
      g.font = `700 26px ${FONT}`;
      g.fillText(fit(g, match.a.label, colW - 44), x + 22, y + 62);
      g.fillText(fit(g, match.b.label, colW - 44), x + 22, y + 92);
    });
    y += rowH;
  });
  if (day === 2) {
    g.fillStyle = MUTED;
    g.font = `500 22px ${FONT}`;
    g.fillText("Quarterfinals 6 overs a side. Semifinals and the final 8 overs. The final is on Ground A; Ground B is reserved.", 70, Math.min(y + 36, H - 110));
  }
  return canvas;
}

export async function renderSheetPages(data: SheetData): Promise<HTMLCanvasElement[]> {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  return [groupsPage(data), dayPage(data, 1), dayPage(data, 2)];
}

const blobOf = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The file could not be created."))), type, quality));

/** A PDF with each page as one full-page JPEG. Written by hand so no library has to be downloaded. */
export async function pdfFromCanvases(pages: HTMLCanvasElement[]): Promise<Blob> {
  const chunks: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const object = (number: number, body: () => void) => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  const jpegs = await Promise.all(pages.map(async (canvas) => new Uint8Array(await (await blobOf(canvas, "image/jpeg", 0.93)).arrayBuffer())));
  const widthPt = 595.28;
  const heightPt = 841.89;
  push("%PDF-1.4\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`));
  pages.forEach((canvas, i) => {
    const pageNo = 3 + i * 3;
    const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`;
    object(pageNo, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 ${pageNo + 2} 0 R >> >> /Contents ${pageNo + 1} 0 R >>`));
    object(pageNo + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(pageNo + 2, () => {
      const bytes = jpegs[i] as Uint8Array;
      push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push("\nendstream");
    });
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n += 1) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const parts = chunks.map((chunk) => (typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk));
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadSheet(format: "png" | "pdf", data: SheetData): Promise<void> {
  const pages = await renderSheetPages(data);
  const base = data.official ? "ncl-2026-groups-and-fixtures" : "ncl-2026-trial-groups-and-fixtures";
  if (format === "pdf") {
    save(await pdfFromCanvases(pages), `${base}.pdf`);
    return;
  }
  const tall = document.createElement("canvas");
  tall.width = W;
  tall.height = H * pages.length;
  const g = tall.getContext("2d");
  if (!g) throw new Error("Your browser cannot create the image.");
  pages.forEach((canvas, index) => g.drawImage(canvas, 0, index * H));
  save(await blobOf(tall, "image/png"), `${base}.png`);
}

