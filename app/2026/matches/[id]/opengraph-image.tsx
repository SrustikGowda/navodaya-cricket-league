import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";
import { formatIst } from "@/lib/format";
import { getPublicFixture } from "@/lib/public-data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NCL 2026 match";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await getPublicFixture(await getDb(), id);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "#10241c", color: "#f6f1e6", padding: "64px" }}>
        <div style={{ fontSize: 28, color: "#e7d5b4" }}>NCL 2026{fixture?.matchNumber ? ` · Match ${fixture.matchNumber}` : ""}</div>
        <div style={{ fontSize: 64, marginTop: 16 }}>{fixture ? `${fixture.teamALabel} vs ${fixture.teamBLabel}` : "Match"}</div>
        <div style={{ fontSize: 30, marginTop: 12 }}>{fixture ? `${formatIst(fixture.startsAt)} · ${fixture.groundName ?? "Ground to be announced"}` : ""}</div>
      </div>
    ),
    { ...size },
  );
}
