"use client";

import { useState } from "react";

export function SignOutButton({ className = "admin-text-button" }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/2026");
  }

  return (
    <button className={className} type="button" onClick={signOut} disabled={pending}>
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}
