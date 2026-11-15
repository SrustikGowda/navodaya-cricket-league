"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { ActionName } from "@/lib/analytics";

const SKIP = /^\/(admin|api|_next)(\/|$)/;

function allowed(): boolean {
  if (typeof navigator === "undefined") return false;
  // Respect "Do Not Track".
  return navigator.doNotTrack !== "1" && (window as unknown as { doNotTrack?: string }).doNotTrack !== "1";
}

function send(payload: Record<string, unknown>) {
  if (!allowed()) return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, device: window.innerWidth < 760 ? "phone" : "desktop" }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Counts something the visitor did, such as downloading the schedule. Silent, and never in the way. */
export function track(name: ActionName) {
  send({ type: "action", name });
}

/** Counts each public page a visitor opens. Renders nothing. */
export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || SKIP.test(pathname)) return;
    send({ type: "view", path: pathname });
  }, [pathname]);
  return null;
}
