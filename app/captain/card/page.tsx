import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getOwnRegistration } from "@/lib/registration";
import { getActiveSeason } from "@/lib/season";

export const metadata = { title: "Registration card", robots: { index: false, follow: false } };

export default async function CardPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/captain/login?next=/captain/card");
  const { id } = await searchParams;
  if (!id) notFound();
  const registration = await getOwnRegistration(await getDb(), actor, id);
  if (!registration) notFound();
  const season = await getActiveSeason(await getDb());
  return (
    <main id="content" className="card-sheet">
      <p>NCL {season.year} · registration card</p>
      <h1>{registration.teamName || "Untitled team"}</h1>
      <p>Reference {registration.reference ?? "Not issued"}</p>
      <p>Batch {registration.batchAdmissionYear ?? "—"}–{registration.batchLeavingYear ?? "—"}</p>
      <p>Status {registration.status.replaceAll("_", " ")}</p>
      <h2>Squad</h2>
      <ul>
        {registration.players.filter((player) => player.publicState !== "pending_remove").map((player) => (
          <li key={player.id}>{player.name} · {player.role.replaceAll("_", " ")}{player.jerseyNumber != null ? ` · ${player.jerseyNumber}` : ""}</li>
        ))}
      </ul>
      <p className="quiet">This card omits phone numbers, email addresses and payment references so it can be shown at the ground.</p>
    </main>
  );
}
