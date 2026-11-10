// Draws a clean, WhatsApp-sized card (1080 x 1350) for a team's fixtures on a canvas. Client only.

import { DAY_LABEL, timeText, type ViewMatch } from "./view";

export type ShareCard = {
  teamName: string;
  groupLine: string;
  seedLine: string | null;
  matches: { match: ViewMatch; opponent: string; opponentSlot: string | null }[];
  official: boolean;
  drawRef: string | null;
  url: string;
};

const GOLD = "#f0c862";
const GOLD_DEEP = "#c9971f";

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/brand/jnv-logo.png";
  });
}

export async function renderShareCard(card: ShareCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Your browser cannot create the image.");
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const text = '"RPL Text", "Helvetica Neue", Arial, sans-serif';

  g.fillStyle = "#080808";
  g.fillRect(0, 0, 1080, 1350);
  const rail = g.createLinearGradient(0, 0, 1080, 0);
  rail.addColorStop(0, GOLD_DEEP);
  rail.addColorStop(0.5, GOLD);
  rail.addColorStop(1, GOLD_DEEP);
  g.fillStyle = rail;
  g.fillRect(0, 0, 1080, 10);

  const logo = await loadLogo();
  if (logo) {
    g.fillStyle = "#f6f1e6";
    g.beginPath();
    g.roundRect(64, 56, 84, 104, 14);
    g.fill();
    g.drawImage(logo, 72, 62, 68, 92);
  }
  g.fillStyle = GOLD;
  g.font = `700 26px ${text}`;
  g.fillText("NAVODAYA CRICKET LEAGUE 2026", 176, 96);
  g.fillStyle = "#a9a18d";
  g.font = `500 24px ${text}`;
  g.fillText(card.official ? `Official draw${card.drawRef ? ` · ${card.drawRef}` : ""}` : "TRIAL DRAW · NOT OFFICIAL", 176, 134);

  g.fillStyle = "#f4efe4";
  let size = 84;
  g.font = `900 ${size}px "RPL Display", "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(card.teamName).width > 950 && size > 44) {
    size -= 4;
    g.font = `900 ${size}px "RPL Display", "Helvetica Neue", Arial, sans-serif`;
  }
  const nameLines = wrap(g, card.teamName, 950);
  let y = 270;
  for (const line of nameLines) {
    g.fillText(line, 64, y);
    y += size + 6;
  }
  g.fillStyle = GOLD;
  g.font = `700 34px ${text}`;
  g.fillText(card.groupLine, 64, y + 6);
  y += 54;
  if (card.seedLine) {
    g.fillStyle = "#a9a18d";
    g.font = `500 28px ${text}`;
    g.fillText(card.seedLine, 64, y);
    y += 40;
  }
  y += 28;

  for (const entry of card.matches) {
    g.fillStyle = "#14130f";
    g.strokeStyle = "rgba(240,200,98,0.28)";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(64, y, 952, 190, 20);
    g.fill();
    g.stroke();
    g.fillStyle = GOLD;
    g.font = `700 28px ${text}`;
    g.fillText(`${DAY_LABEL[entry.match.day].toUpperCase()} · MATCH ${entry.match.number}`, 96, y + 52);
    g.fillStyle = "#f4efe4";
    g.font = `900 46px "RPL Display", "Helvetica Neue", Arial, sans-serif`;
    g.fillText(timeText(entry.match.startMinutes), 96, y + 108);
    g.fillStyle = "#a9a18d";
    g.font = `500 28px ${text}`;
    g.fillText(entry.match.groundName, 96, y + 150);
    g.fillStyle = "#f4efe4";
    g.font = `700 36px ${text}`;
    g.textAlign = "right";
    const opponent = entry.opponent.length > 24 ? `${entry.opponent.slice(0, 23)}…` : entry.opponent;
    g.fillText(`vs ${opponent}`, 984, y + 104);
    g.fillStyle = "#a9a18d";
    g.font = `500 26px ${text}`;
    g.fillText(`${entry.match.overs} overs a side${entry.opponentSlot ? ` · ${entry.opponentSlot}` : ""}`, 984, y + 148);
    g.textAlign = "left";
    y += 214;
  }

  g.fillStyle = "#a9a18d";
  g.font = `500 24px ${text}`;
  g.fillText(card.url.replace(/^https?:\/\//, ""), 64, 1296);
  if (!card.official) {
    g.save();
    g.translate(540, 675);
    g.rotate(-Math.PI / 7);
    g.font = '900 92px "RPL Display", Arial, sans-serif';
    g.textAlign = "center";
    g.fillStyle = "rgba(240,87,75,0.22)";
    g.fillText("TRIAL — NOT OFFICIAL", 0, 0);
    g.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be created."))), "image/png"));
}
