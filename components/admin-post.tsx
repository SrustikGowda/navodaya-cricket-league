"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./post-json";

export function useAdminPost() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(action: string, body: Record<string, unknown>) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await postJson("/api/admin", { action, ...body });
      setMessage(describe(result));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nothing was saved.");
    } finally {
      setPending(false);
    }
  }

  return { submit, message, error, pending };
}

export function AdminFeedback({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message ? <p className="note" role="status">{message}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </>
  );
}

function describe(result: Record<string, unknown>): string {
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts : null;
  if (conflicts) {
    const lines = conflicts.map((item) => (item && typeof item === "object" && "message" in item ? String(item.message) : "")).filter(Boolean);
    const count = typeof result.fixtureCount === "number" ? result.fixtureCount : null;
    if (lines.length === 0) return count == null ? "No schedule conflicts." : `No conflicts in ${count} draft matches.`;
    return lines.join(" ");
  }
  if (Array.isArray(result.changed)) return `This delay would move ${result.changed.length} matches. Publish it only after you have checked that list.`;
  if (typeof result.count === "number") return `Imported ${result.count} matches into the draft.`;
  return "Saved.";
}
