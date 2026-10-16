"use client";

import { useState } from "react";
import { postJson } from "./post-json";

export function AdminPasswordForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    try {
      await postJson("/api/admin/password", { password });
      window.location.assign("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That password is not correct.");
      setPending(false);
    }
  }

  return (
    <form className="admin-signin" onSubmit={submit}>
      <h1>Organizer sign-in</h1>
      <p>Enter the organizer password. A captain account does not open this area.</p>
      <label className="field">
        Password
        <input className="text-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={pending}>{pending ? "Checking" : "Sign in"}</button>
    </form>
  );
}
