"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { normalizeName } from "@/lib/format";
import { postJson, RequestError } from "./post-json";

type FieldErrors = Partial<Record<"teamName" | "admission" | "leaving" | "batch" | "captainName" | "email" | "phone" | "viceName" | "vicePhone" | "consent" | "fee" | "rules", string>>;

const DUPLICATE_NAME = "This team name is already registered.";
const DUPLICATE_BATCH = "This batch already has a registration.";

type Confirmation = {
  reference: string;
  statusLabel: string;
  alreadySubmitted: boolean;
  nextAction: string;
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  waitlisted: "Waitlisted",
  changes_requested: "Changes requested",
  draft: "Draft",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function RegistrationForm({
  rulesVersion,
  feePaise,
  feeLabel,
  dueLabel,
  takenNames,
  takenBatches,
}: {
  rulesVersion: string | null;
  feePaise: number | null;
  feeLabel: string | null;
  dueLabel: string | null;
  takenNames: string[];
  takenBatches: { admission: number; leaving: number }[];
}) {
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const feeRequired = feePaise != null && feePaise > 0 && Boolean(feeLabel);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const errors = validate(form, takenNames, takenBatches);
    setFieldErrors(errors);
    setError("");
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      const fieldName: Record<string, string> = {
        teamName: "teamName",
        admission: "batchAdmissionYear",
        batch: "batchAdmissionYear",
        leaving: "batchLeavingYear",
        captainName: "captainName",
        email: "captainEmail",
        phone: "captainPhone",
        viceName: "viceCaptainName",
        vicePhone: "viceCaptainPhone",
        consent: "publicationConsent",
        fee: "feeConsent",
        rules: "rulesAcknowledged",
      };
      const field = form.querySelector<HTMLElement>(`[name="${fieldName[firstInvalid]}"]`);
      field?.focus();
      return;
    }
    const data = new FormData(form);
    sending.current = true;
    setPending(true);
    try {
      const saved = await postJson("/api/register", {
        teamName: String(data.get("teamName") ?? ""),
        batchAdmissionYear: Number(data.get("batchAdmissionYear")),
        batchLeavingYear: Number(data.get("batchLeavingYear")),
        captainName: String(data.get("captainName") ?? ""),
        captainEmail: String(data.get("captainEmail") ?? ""),
        captainPhone: String(data.get("captainPhone") ?? ""),
        viceCaptainName: String(data.get("viceCaptainName") ?? ""),
        viceCaptainPhone: String(data.get("viceCaptainPhone") ?? ""),
        publicationConsent: data.get("publicationConsent") === "on",
        feeConsent: data.get("feeConsent") === "on",
        rulesAcknowledged: data.get("rulesAcknowledged") === "on",
      });
      const reference = typeof saved.reference === "string" ? saved.reference : "";
      const status = typeof saved.status === "string" ? saved.status : "";
      const nextAction = typeof saved.nextAction === "string" ? saved.nextAction : "";
      if (!reference || !status || !nextAction) {
        throw new Error("Nothing was submitted and no reference was issued.");
      }
      setConfirmation({
        reference,
        statusLabel: STATUS_LABELS[status] ?? status,
        alreadySubmitted: saved.alreadySubmitted === true,
        nextAction,
      });
    } catch (caught) {
      if (caught instanceof RequestError && (caught.code === "duplicate_name" || caught.code === "duplicate_batch")) {
        const duplicate: FieldErrors = caught.code === "duplicate_name" ? { teamName: DUPLICATE_NAME } : { batch: DUPLICATE_BATCH };
        setFieldErrors(duplicate);
        const field = form.querySelector<HTMLElement>(`[name="${caught.code === "duplicate_name" ? "teamName" : "batchAdmissionYear"}"]`);
        field?.focus();
      } else {
        setError(caught instanceof Error ? caught.message : "Nothing was submitted and no reference was issued.");
      }
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  if (confirmation) {
    return (
      <section className="note register-confirmation" role="status">
        <h2>{confirmation.alreadySubmitted ? "This email already has an application." : "Registration received."}</h2>
        <p>Status: {confirmation.statusLabel}</p>
        <p>Reference {confirmation.reference}.</p>
        <p>{confirmation.nextAction}</p>
      </section>
    );
  }

  function refreshClaims(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const clashes = claimWarnings(form, takenNames, takenBatches);
    setFieldErrors((current) => ({
      ...current,
      teamName: clashes.teamName ?? (current.teamName === DUPLICATE_NAME ? undefined : current.teamName),
      batch: clashes.batch ?? (current.batch === DUPLICATE_BATCH ? undefined : current.batch),
    }));
  }

  const paymentCopy = dueLabel
    ? `I agree to pay ${feeLabel} per team ${dueLabel}.`
    : `I agree to pay ${feeLabel} per team. The payment deadline has not been set.`;

  return (
    <form className="register-form stack" onSubmit={submit} onInput={refreshClaims} noValidate aria-busy={pending}>
      <fieldset className="details" disabled={pending}>
        <legend>Team details</legend>
        <div className="fields">
          <label className="field">
            <span className="field-label">Team name</span>
            <input className="text-input" name="teamName" type="text" required minLength={2} autoComplete="organization" aria-invalid={Boolean(fieldErrors.teamName)} />
            {fieldErrors.teamName ? <span className="field-error">{fieldErrors.teamName}</span> : null}
          </label>
          <div className="year-row">
            <label className="field">
              <span className="field-label">Admission year</span>
              <input className="text-input" name="batchAdmissionYear" type="number" inputMode="numeric" required min={1960} max={2100} placeholder="e.g. 2008" autoComplete="off" aria-invalid={Boolean(fieldErrors.admission || fieldErrors.batch)} />
              {fieldErrors.admission ? <span className="field-error">{fieldErrors.admission}</span> : null}
            </label>
            <label className="field">
              <span className="field-label">Leaving year</span>
              <input className="text-input" name="batchLeavingYear" type="number" inputMode="numeric" required min={1960} max={2100} placeholder="e.g. 2015" autoComplete="off" aria-invalid={Boolean(fieldErrors.leaving || fieldErrors.batch)} />
              {fieldErrors.leaving ? <span className="field-error">{fieldErrors.leaving}</span> : null}
            </label>
          </div>
          {fieldErrors.batch ? <p className="field-error" role="alert">{fieldErrors.batch}</p> : null}
        </div>
      </fieldset>
      <fieldset className="details" disabled={pending}>
        <legend>Captain details</legend>
        <div className="fields">
          <label className="field">
            <span className="field-label">Captain name</span>
            <input className="text-input" name="captainName" type="text" required minLength={2} autoComplete="name" aria-invalid={Boolean(fieldErrors.captainName)} />
            {fieldErrors.captainName ? <span className="field-error">{fieldErrors.captainName}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="text-input" name="captainEmail" type="email" required autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} />
            {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">Mobile / WhatsApp</span>
            <input className="text-input" name="captainPhone" type="tel" required autoComplete="tel" inputMode="tel" aria-invalid={Boolean(fieldErrors.phone)} />
            {fieldErrors.phone ? <span className="field-error">{fieldErrors.phone}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">Vice-captain name <span className="optional">Optional</span></span>
            <input className="text-input" name="viceCaptainName" type="text" autoComplete="name" aria-invalid={Boolean(fieldErrors.viceName)} />
            {fieldErrors.viceName ? <span className="field-error">{fieldErrors.viceName}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">Vice-captain mobile <span className="optional">Optional</span></span>
            <input className="text-input" name="viceCaptainPhone" type="tel" autoComplete="tel" inputMode="tel" aria-invalid={Boolean(fieldErrors.vicePhone)} />
            {fieldErrors.vicePhone ? <span className="field-error">{fieldErrors.vicePhone}</span> : null}
          </label>
          <p className="register-privacy">Email stays with the organizers. After approval, the team list shows the captain and vice-captain name and mobile number.</p>
        </div>
      </fieldset>
      <div className="agreements">
        <label className="field check">
          <input type="checkbox" name="publicationConsent" required disabled={pending} aria-invalid={Boolean(fieldErrors.consent)} />
          <span>I agree to publish the team name, batch, and captain and vice-captain name and mobile number after approval.</span>
          {fieldErrors.consent ? <span className="field-error">{fieldErrors.consent}</span> : null}
        </label>
        {feeRequired ? (
          <label className="field check">
            <input type="checkbox" name="feeConsent" required disabled={pending} aria-invalid={Boolean(fieldErrors.fee)} />
            <span>{paymentCopy}</span>
            {fieldErrors.fee ? <span className="field-error">{fieldErrors.fee}</span> : null}
          </label>
        ) : null}
        {rulesVersion?.trim() ? (
          <label className="field check">
            <input type="checkbox" name="rulesAcknowledged" required disabled={pending} aria-invalid={Boolean(fieldErrors.rules)} />
            <span>I acknowledge the <Link href="/2026/rules">playing conditions</Link> (version {rulesVersion}).</span>
            {fieldErrors.rules ? <span className="field-error">{fieldErrors.rules}</span> : null}
          </label>
        ) : null}
      </div>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button className="button register-submit" type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit registration"}</button>
    </form>
  );
}

function claimWarnings(form: HTMLFormElement, names: string[], batches: { admission: number; leaving: number }[]): FieldErrors {
  const read = (name: string) => String(new FormData(form).get(name) ?? "").trim();
  const errors: FieldErrors = {};
  const teamName = read("teamName");
  if (teamName.length >= 2 && names.includes(normalizeName(teamName))) errors.teamName = DUPLICATE_NAME;
  const admission = Number(read("batchAdmissionYear"));
  const leaving = Number(read("batchLeavingYear"));
  if (Number.isInteger(admission) && Number.isInteger(leaving) && batches.some((batch) => batch.admission === admission && batch.leaving === leaving)) {
    errors.batch = DUPLICATE_BATCH;
  }
  return errors;
}

function validate(form: HTMLFormElement, names: string[], batches: { admission: number; leaving: number }[]): FieldErrors {
  const read = (name: string) => String(new FormData(form).get(name) ?? "").trim();
  const errors: FieldErrors = { ...claimWarnings(form, names, batches) };
  if (!errors.teamName && read("teamName").length < 2) errors.teamName = "Enter the team name.";
  const admission = Number(read("batchAdmissionYear"));
  const leaving = Number(read("batchLeavingYear"));
  if (!Number.isInteger(admission) || admission < 1960 || admission > 2100) errors.admission = "Enter the admission year.";
  if (!Number.isInteger(leaving) || leaving < 1960 || leaving > 2100) errors.leaving = "Enter the leaving year.";
  else if (!errors.admission && leaving < admission) errors.leaving = "The leaving year cannot be earlier than the admission year.";
  if (read("captainName").length < 2) errors.captainName = "Enter the captain's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(read("captainEmail"))) errors.email = "Enter a valid email address.";
  const digits = read("captainPhone").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) errors.phone = "Enter a valid Indian mobile number.";
  const viceName = read("viceCaptainName");
  const viceDigits = read("viceCaptainPhone").replace(/\D/g, "");
  const viceLocal = viceDigits.length === 12 && viceDigits.startsWith("91") ? viceDigits.slice(2) : viceDigits.length === 11 && viceDigits.startsWith("0") ? viceDigits.slice(1) : viceDigits;
  if (viceName && viceName.length < 2) errors.viceName = "Enter the vice-captain's name, or leave it blank.";
  if (viceDigits && !/^[6-9]\d{9}$/.test(viceLocal)) errors.vicePhone = "Enter a valid vice-captain mobile number, or leave it blank.";
  const consent = form.querySelector<HTMLInputElement>("[name='publicationConsent']");
  const fee = form.querySelector<HTMLInputElement>("[name='feeConsent']");
  const rules = form.querySelector<HTMLInputElement>("[name='rulesAcknowledged']");
  if (!consent?.checked) errors.consent = "Publication consent is required.";
  if (fee && !fee.checked) errors.fee = "Acknowledge the registration fee.";
  if (rules && !rules.checked) errors.rules = "Acknowledge the playing conditions.";
  return errors;
}
