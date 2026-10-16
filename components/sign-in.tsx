"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./post-json";
import { safeNextPath } from "@/lib/format";

export function SignInForm({ next, localAuth }: { next?: string; localAuth: boolean }) {
  const router = useRouter();
  const destination = safeNextPath(next);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function magic(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson("/api/auth/magic-link", { email, next: destination });
      setMessage(String(data.message ?? "Check your email for a sign-in link."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email could not be sent.");
    } finally {
      setPending(false);
    }
  }

  async function dev(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await postJson("/api/auth/dev-login", { email });
      router.push(destination);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Development sign-in failed.");
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <form onSubmit={magic} className="stack">
        <label className="field">
          Email
          <input className="text-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="button" disabled={pending} type="submit">Email me a sign-in link</button>
      </form>
      {localAuth ? (
        <form onSubmit={dev} className="note stack">
          <p><strong>Development sign-in.</strong> This is disabled in production and does not send an email.</p>
          <button className="button secondary" disabled={pending} type="submit">Continue on this device</button>
        </form>
      ) : null}
      {message ? <p className="note" role="status">{message}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </div>
  );
}
