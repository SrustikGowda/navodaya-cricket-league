"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./post-json";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      type="button"
      onClick={async () => {
        await postJson("/api/auth/logout", {});
        router.push("/2026");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function PaymentBox({ registrationId, note }: { registrationId: string; note: string }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/captain/receipt", { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
    if (!response.ok || !data.path) throw new Error(data.error || "The receipt was not stored.");
    setReceiptPath(data.path);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await postJson("/api/captain", {
        action: "payment",
        id: registrationId,
        transactionReference: reference,
        receiptPath,
        note,
      });
      setMessage("Reference submitted. It stays unverified until an organizer checks the receiving account.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The payment was not submitted.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">UPI transaction reference<input className="text-input" value={reference} onChange={(event) => setReference(event.target.value)} required /></label>
      <label className="field">Receipt, optional<input className="text-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file).catch((caught) => setError(caught.message)); }} /></label>
      <button className="button" type="submit">Submit payment reference</button>
      <p className="quiet">A screenshot or returning from a UPI app does not mark this paid.</p>
      {message ? <p className="note" role="status">{message}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </form>
  );
}
