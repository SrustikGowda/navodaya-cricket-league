"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { istParts, parseIstInput } from "@/lib/format";
import { postJson } from "./post-json";

type Values = Record<string, string | number | boolean | null>;

/**
 * The few season details organizers change. Fields left out here (fee deadline, waitlist, one team per batch, CricHeroes
 * link) keep whatever value they already have, because only the keys sent are saved.
 */
export function SettingsForm({ version, values }: { version: number; values: Values }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(values.registrationAnnounced === true);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;
    try {
      const closes = String(form.get("registrationClosesAt") ?? "").trim();
      const closesAt = closes ? parseIstInput(closes) : null;
      if (closes && !closesAt) throw new Error("Registration closes must be a date and time.");
      const fee = String(form.get("fee") ?? "").trim();
      const rupees = fee === "" ? null : Number(fee);
      if (rupees != null && (!Number.isFinite(rupees) || rupees < 0)) throw new Error("Enter the entry fee in rupees, or leave it blank.");
      setPending(true);
      await postJson("/api/admin", {
        action: "settings",
        version,
        patch: {
          registrationAnnounced: form.get("registrationAnnounced") === "on",
          ...(registrationOpen ? { registrationClosesAt: closesAt } : {}),
          startDate: String(form.get("startDate") ?? ""),
          endDate: String(form.get("endDate") ?? ""),
          fixturesOn: text("fixturesOn"),
          venueName: String(form.get("venueName") ?? ""),
          venueAddress: String(form.get("venueAddress") ?? ""),
          mapsUrl: text("mapsUrl"),
          feePaise: rupees == null ? null : Math.round(rupees * 100),
          contactName: text("contactName"),
          contactPhone: text("contactPhone"),
          contactEmail: text("contactEmail"),
          rulesText: text("rulesText"),
        },
      });
      setSaved("Saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings were not saved.");
    } finally {
      setPending(false);
    }
  }

  const value = (name: string) => (values[name] == null ? "" : String(values[name]));
  const day = (name: string) => value(name).slice(0, 10);

  return (
    <form className="set-card" id="season" onSubmit={submit}>
      <h2>Season</h2>
      <label className="set-switch">
        <input type="checkbox" name="registrationAnnounced" checked={registrationOpen} onChange={(event) => setRegistrationOpen(event.target.checked)} />
        Registration open
      </label>
      <div className="set-grid">
        {registrationOpen ? (
          <label className="field wide">
            Registration closes (IST)
            <input className="text-input" name="registrationClosesAt" type="datetime-local" defaultValue={istDatetimeLocal(values.registrationClosesAt)} />
          </label>
        ) : null}
        <label className="field">
          First match day
          <input className="text-input" name="startDate" type="date" required defaultValue={day("startDate")} />
        </label>
        <label className="field">
          Last match day
          <input className="text-input" name="endDate" type="date" required defaultValue={day("endDate")} />
        </label>
        <label className="field">
          Fixtures published on
          <input className="text-input" name="fixturesOn" type="date" defaultValue={day("fixturesOn")} />
        </label>
        <label className="field">
          Entry fee per team (₹)
          <input className="text-input" name="fee" inputMode="numeric" placeholder="Blank if not decided" defaultValue={rupeeField(values.feePaise)} />
        </label>
        <label className="field">
          Venue
          <input className="text-input" name="venueName" defaultValue={value("venueName")} />
        </label>
        <label className="field">
          Google Maps link
          <input className="text-input" name="mapsUrl" type="url" defaultValue={value("mapsUrl")} />
        </label>
        <label className="field wide">
          Address
          <input className="text-input" name="venueAddress" defaultValue={value("venueAddress")} />
        </label>
        <label className="field">
          Contact name
          <input className="text-input" name="contactName" defaultValue={value("contactName")} />
        </label>
        <label className="field">
          Contact phone
          <input className="text-input" name="contactPhone" type="tel" defaultValue={value("contactPhone")} />
        </label>
        <label className="field wide">
          Contact email
          <input className="text-input" name="contactEmail" type="email" defaultValue={value("contactEmail")} />
        </label>
        <label className="field wide">
          Rules (shown on the Rules page)
          <textarea name="rulesText" rows={4} defaultValue={value("rulesText")} />
        </label>
      </div>
      <div className="set-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </button>
        {saved ? (
          <p className="note" role="status">
            {saved}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function rupeeField(value: string | number | boolean | null): string {
  if (typeof value !== "number") return "";
  const rupees = value / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

function istDatetimeLocal(value: string | number | boolean | null): string {
  if (typeof value !== "string" || !value.trim()) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}/.test(value)) return value.slice(0, 16);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = istParts(value);
  const hours = Math.floor(parts.minutes / 60);
  const mins = parts.minutes % 60;
  return `${parts.date}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function JsonAction({ action, label, initial }: { action: string; label: string; initial: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setSaved("");
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          await postJson("/api/admin", { action, ...parsed });
          setSaved("Saved.");
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Nothing was saved.");
        }
      }}
    >
      <label className="field">{label}<textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <button className="button" type="submit">Run</button>
      {saved ? <p className="note" role="status">{saved}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </form>
  );
}
