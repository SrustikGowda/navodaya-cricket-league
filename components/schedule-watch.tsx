"use client";

import { useEffect, useState } from "react";
import { formatIst } from "@/lib/format";

export function ScheduleWatch({ sequence, updatedAt }: { sequence: number; updatedAt: string | null }) {
  const [state, setState] = useState<"current" | "updated" | "offline">("current");
  const [synced, setSynced] = useState<string | null>(null);

  useEffect(() => {
    let timer = 20000;
    let stopped = false;
    let handle = 0;
    async function poll() {
      if (stopped || document.hidden) {
        handle = window.setTimeout(poll, timer);
        return;
      }
      try {
        const response = await fetch("/api/public/meta");
        if (!response.ok) throw new Error("status");
        const data = (await response.json()) as { sequence: number; updatedAt: string | null };
        setSynced(new Date().toISOString());
        setState(data.sequence !== sequence || data.updatedAt !== updatedAt ? "updated" : "current");
        timer = 20000;
      } catch {
        setState("offline");
        timer = Math.min(timer * 2, 120000);
      }
      if (!stopped) handle = window.setTimeout(poll, timer);
    }
    handle = window.setTimeout(poll, timer);
    return () => {
      stopped = true;
      window.clearTimeout(handle);
    };
  }, [sequence, updatedAt]);

  return (
    <p className="quiet" role="status">
      {state === "updated" ? "The schedule was updated. Refresh to load the new times and calendar sequence." : null}
      {state === "offline" ? `Offline or unable to refresh. Last synced ${synced ? formatIst(synced) : "when this page opened"}.` : null}
      {state === "current" ? `Schedule last checked ${synced ? formatIst(synced) : "just now"}.` : null}
    </p>
  );
}
