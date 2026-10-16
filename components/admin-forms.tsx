"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { istParts, parseIstInput } from "@/lib/format";
import { postJson } from "./post-json";

export function SettingsForm({ version, values }: { version: number; values: Record<string, string | number | boolean | null> }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(values.registrationAnnounced === true);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? value : null;
    };
    const instant = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      if (!value) return null;
      const parsed = parseIstInput(value);
      if (!parsed) throw new Error(`${name} must be an IST time such as 2026-10-01 10:00.`);
      return parsed;
    };
    const rupeesToPaise = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      if (value === "") return null;
      const rupees = Number(value);
      if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Enter the entry fee in rupees, or leave it blank.");
      return Math.round(rupees * 100);
    };
    try {
      await postJson("/api/admin", {
        action: "settings",
        version,
        patch: {
          venueName: String(form.get("venueName") ?? ""),
          venueAddress: String(form.get("venueAddress") ?? ""),
          mapsUrl: text("mapsUrl"),
          registrationClosesAt: instant("registrationClosesAt"),
          registrationAnnounced: form.get("registrationAnnounced") === "on",
          startDate: String(form.get("startDate") ?? ""),
          endDate: String(form.get("endDate") ?? ""),
          fixturesOn: text("fixturesOn"),
          feePaise: rupeesToPaise("feePaise"),
          feeDueAt: instant("feeDueAt"),
          rulesText: text("rulesText"),
          contactName: text("contactName"),
          contactEmail: text("contactEmail"),
          contactPhone: text("contactPhone"),
          cricheroesTournamentUrl: text("cricheroesTournamentUrl"),
          oneTeamPerBatch: form.get("oneTeamPerBatch") === "on",
          waitlistEnabled: form.get("waitlistEnabled") === "on",
        },
      });
      setSaved("Settings saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings were not saved.");
    }
  }

  const fields: [string, string][] = [
    ["venueName", "Venue name"],
    ["venueAddress", "Address"],
    ["mapsUrl", "Verified map link"],
    ["registrationClosesAt", "Registration closes"],
    ["startDate", "Match start date"],
    ["endDate", "Match end date"],
    ["fixturesOn", "Fixtures date"],
    ["feePaise", "Entry fee in rupees, blank if undecided, 0 if free"],
    ["feeDueAt", "Registration fee due, IST"],
    ["contactName", "Contact name"],
    ["contactEmail", "Contact email"],
    ["contactPhone", "Contact phone"],
    ["cricheroesTournamentUrl", "CricHeroes tournament URL"],
  ];

  const timeFields = new Set(["registrationClosesAt", "feeDueAt"]);
  const dateFields = new Set(["startDate", "endDate", "fixturesOn"]);
  const registrationDates = new Set(["registrationClosesAt"]);

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        <input type="checkbox" name="registrationAnnounced" checked={registrationOpen} onChange={(event) => setRegistrationOpen(event.target.checked)} /> Open registration
      </label>
      <p className="quiet">{registrationOpen ? "Set the close date. Registration stays open until then." : "Registration stays on “opens soon” until this is turned on."}</p>
      {fields.map(([name, label]) => (
        <label key={name} className="field" hidden={!registrationOpen && registrationDates.has(name)}>{label}
          <input
            className="text-input"
            name={name}
            type={timeFields.has(name) ? "datetime-local" : dateFields.has(name) ? "date" : "text"}
            required={name === "startDate" || name === "endDate"}
            defaultValue={timeFields.has(name) ? istDatetimeLocal(values[name]) : name === "feePaise" ? rupeeField(values[name]) : values[name] == null ? "" : String(values[name]).slice(0, dateFields.has(name) ? 10 : undefined)}
          />
        </label>
      ))}
      <label className="field">Rules text<textarea name="rulesText" defaultValue={values.rulesText == null ? "" : String(values.rulesText)} /></label>
      <label><input type="checkbox" name="waitlistEnabled" defaultChecked={values.waitlistEnabled === true} /> Enable waitlist when the approved limit is reached</label>
      <label><input type="checkbox" name="oneTeamPerBatch" defaultChecked={values.oneTeamPerBatch === true} /> Limit the season to one active team per batch</label>
      <button className="button" type="submit">Save settings</button>
      {saved ? <p className="note" role="status">{saved}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
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
