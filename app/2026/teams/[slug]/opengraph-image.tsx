import { ImageResponse } from "next/og";
import { getDb } from "@/lib/db";
import { getPublicTeam } from "@/lib/public-data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NCL 2026 team";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getPublicTeam(await getDb(), slug);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "#10241c", color: "#f6f1e6", padding: "64px" }}>
        <div style={{ fontSize: 28, color: "#e7d5b4" }}>Navodaya Cricket League 2026</div>
        <div style={{ fontSize: 72, marginTop: 16 }}>{team?.teamName ?? "Team"}</div>
        <div style={{ fontSize: 32, marginTop: 12 }}>{team ? `Batch ${team.batchAdmissionYear}–${team.batchLeavingYear}` : ""}</div>
      </div>
    ),
    { ...size },
  );
}
