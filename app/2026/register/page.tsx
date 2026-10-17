import Link from "next/link";
import { RegistrationForm } from "@/components/registration-form";
import { PublicShell } from "@/components/shell";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatEventDates, formatInrFromPaise, formatIst } from "@/lib/format";
import { listRegistrationClaims } from "@/lib/registration";
import { getActiveSeason, registrationAvailability, registrationPhase, registrationReadiness } from "@/lib/season";

export const metadata = { title: "Register", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const db = await getDb();
  const season = await getActiveSeason(db);
  const phase = registrationPhase(season);
  const readiness = registrationReadiness(season);
  const availability = registrationAvailability(season);
  const actor = await getActor();
  const claims = await listRegistrationClaims(db, season.id);
  const when = formatEventDates(season.startDate, season.endDate);
  const open = phase === "open";
  const canSubmit = availability.accepting;
  const deadline = season.feeDueAt ? splitIst(formatIst(season.feeDueAt)) : null;
  return (
    <PublicShell registration>
      <div className="register-intro">
      <div className="register-page">
        <Link className="back-home" href="/2026">← Back to home</Link>
        {canSubmit ? (
          <>
            <h1 className="register-title">Register your team</h1>
            <p className="register-subtitle">Enter your team and captain details. All fields are required.</p>
            <section className="register-summary" aria-label="Registration fee">
              <div>
                <p>Entry fee</p>
                <strong>{feeValue(season.feePaise)}</strong>
                {season.feePaise != null && season.feePaise > 0 ? <span>per team</span> : null}
              </div>
              <div>
                <p>Payment deadline</p>
                <strong>{deadline ? deadline.date : "Not set"}</strong>
                {deadline?.time ? <span className="register-time">{deadline.time}</span> : null}
              </div>
              {season.feePaise != null && season.feePaise > 0 ? <p className="register-fee-note">Batches that passed out in 2021 or later do not pay the entry fee.</p> : null}
            </section>
            <RegistrationForm
              rulesVersion={season.rulesVersion}
              feePaise={season.feePaise}
              feeLabel={season.feePaise != null && season.feePaise > 0 ? formatInrFromPaise(season.feePaise) : null}
              dueLabel={season.feeDueAt ? `by ${formatIst(season.feeDueAt)}` : null}
              takenNames={claims.names}
              takenBatches={claims.batches}
            />
          </>
        ) : (
          <section className="register-closed">
            <h1 className="register-title">{availability.label}</h1>
            <p>{when}</p>
            <p>Team registration details will be announced here.</p>
            {open && !readiness.ok ? (
              actor?.role === "organizer" ? (
                <p className="note" role="status">{readiness.message}</p>
              ) : (
                <p>Team registration is not available yet.</p>
              )
            ) : null}
          </section>
        )}
      </div>
      </div>
    </PublicShell>
  );
}

function feeValue(feePaise: number | null): string {
  if (feePaise == null) return "Not set";
  if (feePaise === 0) return "Free";
  return formatInrFromPaise(feePaise);
}

function splitIst(value: string) {
  const splitAt = value.lastIndexOf(", ");
  if (splitAt === -1) return { date: value, time: "" };
  return { date: value.slice(0, splitAt), time: value.slice(splitAt + 2) };
}
