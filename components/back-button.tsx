"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const TRAIL = "ncl-nav-trail";

export function NavTrail() {
  const path = usePathname();
  useEffect(() => {
    const trail = readTrail();
    if (trail.length >= 2 && trail[trail.length - 2] === path) trail.pop();
    else if (trail[trail.length - 1] !== path) trail.push(path);
    sessionStorage.setItem(TRAIL, JSON.stringify(trail.slice(-40)));
  }, [path]);
  return null;
}

export function BackButton() {
  const path = usePathname();
  const router = useRouter();
  if (path === "/" || path === "/2026") return null;

  function goBack() {
    if (readTrail().length >= 2) {
      router.back();
      return;
    }
    router.push(fallback(path));
  }

  return (
    <button className="back-link" type="button" onClick={goBack}>
      ← Back
    </button>
  );
}

function readTrail(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(TRAIL) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function fallback(path: string) {
  if (path.startsWith("/2026/teams/")) return "/2026/teams";
  if (path.startsWith("/2026/matches/")) return "/2026/fixtures";
  if (path.startsWith("/admin/")) return "/admin";
  if (path === "/admin" || path === "/admin/login") return "/2026";
  if (path.startsWith("/2026/")) return "/2026";
  return "/2026";
}
