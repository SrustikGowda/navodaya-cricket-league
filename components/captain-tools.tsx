"use client";

import { useRouter } from "next/navigation";
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
